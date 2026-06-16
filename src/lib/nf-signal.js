/**
 * Procesamiento EEG en vivo — alineado con python/analyze_session.py
 * (bandpass 1–50 Hz, notch 50/60 Hz, potencia relativa por banda).
 */
import {
  NF_BAND_ORDER,
  NF_BANDS,
  NF_FFT_SIZE,
  NF_NOTCH_FREQS,
  NF_POWER_RANGE,
  NF_SAMPLE_RATE,
} from './nf-bands.js';

const DELTA_WEIGHT = 0.7;
const EMA_ALPHA = 0.06;
const EPS = 1e-9;

/** Filtro biquad IIR (Audio EQ Cookbook), procesamiento muestra a muestra. */
class Biquad {
  constructor(type, fs, f0, Q = 0.707) {
    const w0 = (2 * Math.PI * f0) / fs;
    const cosW0 = Math.cos(w0);
    const sinW0 = Math.sin(w0);
    const alpha = sinW0 / (2 * Q);

    let b0, b1, b2, a0, a1, a2;
    switch (type) {
      case 'highpass':
        b0 = (1 + cosW0) / 2;
        b1 = -(1 + cosW0);
        b2 = (1 + cosW0) / 2;
        a0 = 1 + alpha;
        a1 = -2 * cosW0;
        a2 = 1 - alpha;
        break;
      case 'lowpass':
        b0 = (1 - cosW0) / 2;
        b1 = 1 - cosW0;
        b2 = (1 - cosW0) / 2;
        a0 = 1 + alpha;
        a1 = -2 * cosW0;
        a2 = 1 - alpha;
        break;
      case 'notch':
        b0 = 1;
        b1 = -2 * cosW0;
        b2 = 1;
        a0 = 1 + alpha;
        a1 = -2 * cosW0;
        a2 = 1 - alpha;
        break;
      default:
        throw new Error(`Biquad desconocido: ${type}`);
    }

    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
  }

  process(x) {
    const y =
      this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }

  reset() {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
}

/** Cadena de filtros por canal (equivalente aproximado al pre/post Python). */
export class LiveEegFilters {
  constructor(fs = NF_SAMPLE_RATE) {
    this.filters = [
      new Biquad('highpass', fs, 1.0, 0.707),
      ...NF_NOTCH_FREQS.map((f) => new Biquad('notch', fs, f, 30)),
      new Biquad('lowpass', fs, 50.0, 0.707),
    ];
  }

  process(value) {
    let y = value;
    for (const f of this.filters) y = f.process(y);
    return y;
  }

  reset() {
    for (const f of this.filters) f.reset();
  }
}

class EmaZ {
  constructor(alpha = EMA_ALPHA) {
    this.a = alpha;
    this.init = false;
    this.mean = 0;
    this.var = 1;
  }

  update(x) {
    if (!this.init) {
      this.mean = x;
      this.var = 1;
      this.init = true;
      return;
    }
    const mPrev = this.mean;
    this.mean = (1 - this.a) * this.mean + this.a * x;
    this.var = (1 - this.a) * this.var + this.a * (x - mPrev) * (x - mPrev);
    this.var = Math.max(this.var, 1e-6);
  }

  z(x) {
    return (x - this.mean) / Math.sqrt(this.var);
  }

  reset() {
    this.init = false;
    this.mean = 0;
    this.var = 1;
  }
}

/** Estado EMA para normalizar índices en vivo (como analyze_session.py). */
export class FeedbackEma {
  constructor() {
    this.att = new EmaZ();
    this.calm = new EmaZ();
  }

  reset() {
    this.att.reset();
    this.calm.reset();
  }
}

export function sumSpectrumPower(spectrum, fs, startFreq, endFreq) {
  const freqResolution = fs / NF_FFT_SIZE;
  const startIndex = Math.max(0, Math.ceil(startFreq / freqResolution));
  const endIndex = Math.min(spectrum.length - 1, Math.floor(endFreq / freqResolution));
  let acc = 0;
  for (let i = startIndex; i <= endIndex; i++) acc += spectrum[i] * spectrum[i];
  return acc;
}

/**
 * Potencias relativas por banda (%), misma lógica que band_powers_subset_percent en Python.
 * @returns {number[]} [delta, theta, alpha, beta] en %
 */
export function computeBandPercentages(spectrum, fs = NF_SAMPLE_RATE) {
  const [rangeLo, rangeHi] = NF_POWER_RANGE;
  const hiEff = Math.min(rangeHi, fs / 2 - 0.1);
  const total = sumSpectrumPower(spectrum, fs, rangeLo, hiEff);
  if (total <= 1e-12) return [0, 0, 0, 0];

  const raw = NF_BAND_ORDER.map((name) => {
    const [lo, hi] = NF_BANDS[name];
    const bp = sumSpectrumPower(spectrum, fs, lo, Math.min(hi, hiEff));
    return (bp / total) * 100;
  });

  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum <= 0) return [0, 0, 0, 0];
  return raw.map((v) => (v * 100) / sum);
}

export function hannWindow(buffer) {
  const out = buffer.slice(-NF_FFT_SIZE);
  for (let n = 0; n < NF_FFT_SIZE; n++) {
    out[n] *= 0.5 * (1 - Math.cos((2 * Math.PI * n) / (NF_FFT_SIZE - 1)));
  }
  return out;
}

/** Atenúa bins >22 Hz en vivo para reducir EMG/músculo que infla beta (solo sesión, no Python). */
export function attenuateHighFrequencySpectrum(spectrum, fs = NF_SAMPLE_RATE) {
  const n = spectrum.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const freq = (i * fs) / (n * 2);
    let gain = 1;
    if (freq > 22) gain = Math.max(0.35, 1 - (freq - 22) / 24);
    out[i] = spectrum[i] * gain;
  }
  return out;
}

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

function indicesFromBands(bars) {
  const d = Math.max(bars[0] ?? 0, EPS);
  const t = Math.max(bars[1] ?? 0, EPS);
  const a = Math.max(bars[2] ?? 0, EPS);
  const b = Math.max(bars[3] ?? 0, EPS);
  const D = Math.log(d);
  const T = Math.log(t);
  const A = Math.log(a);
  const B = Math.log(b);
  const attIdx = B - Math.log(Math.exp(T) + DELTA_WEIGHT * Math.exp(D) + EPS);
  const calmIdx = Math.log(Math.exp(A) + Math.exp(T) + EPS) - B;
  return { attIdx, calmIdx };
}

/**
 * Índice de retroalimentación en vivo (0–100 %) — misma fórmula que analyze_session.py.
 */
export function computeFeedbackMetrics(protocol, bars, ema = null) {
  const { attIdx, calmIdx } = indicesFromBands(bars);
  if (protocol === 'atencion') {
    if (ema) ema.att.update(attIdx);
    const z = ema ? ema.att.z(attIdx) : attIdx;
    const percent = Math.round(100 * sigmoid(z));
    return { percent, level: percent / 100 };
  }
  if (ema) ema.calm.update(calmIdx);
  const z = ema ? ema.calm.z(calmIdx) : calmIdx;
  const percent = Math.round(100 * sigmoid(z));
  return { percent, level: percent / 100 };
}
