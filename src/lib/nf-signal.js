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
