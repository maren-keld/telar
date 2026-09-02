/**
 * Procesamiento EEG en vivo — alineado con python/analyze_session.py
 * (bandpass 1–50 Hz, notch 50/60 Hz, potencia relativa por banda).
 */
import {
  NF_ARTIFACT_P2P_UV,
  NF_BAND_ORDER,
  NF_BANDS,
  NF_BLINK_P2P_UV,
  NF_BLINK_RISE_MS,
  NF_BLINK_RISE_UV,
  NF_BLINK_WINDOW_MS,
  NF_EMG_BETA_PCT,
  NF_EMG_P2P_UV,
  NF_LIVE_FFT_SIZE,
  NF_LIVE_WINDOW_SEC,
  NF_MOTION_ACCEL_G,
  NF_SHAPE_HIT_RATE,
  NF_MOTION_GYRO_DPS,
  NF_NOTCH_FREQS,
  NF_POWER_RANGE,
  NF_SAMPLE_RATE,
} from './nf-bands.js';

const DELTA_WEIGHT = 0.7;
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

/** Media/varianza por lote sobre toda la línea base (no EMA de los últimos ~20 s). */
class BatchZ {
  constructor() {
    this.samples = [];
    this.init = false;
    this.frozen = false;
    this.mean = 0;
    this.var = 1;
  }

  update(x) {
    if (this.frozen || !Number.isFinite(x)) return;
    this.samples.push(x);
  }

  z(x) {
    return (x - this.mean) / Math.sqrt(this.var);
  }

  freeze() {
    const n = this.samples.length;
    if (n === 0) {
      this.mean = 0;
      this.var = 1;
      this.init = false;
    } else if (n === 1) {
      this.mean = this.samples[0];
      this.var = 1;
      this.init = true;
    } else {
      let sum = 0;
      for (const v of this.samples) sum += v;
      const m = sum / n;
      let acc = 0;
      for (const v of this.samples) acc += (v - m) * (v - m);
      this.mean = m;
      this.var = Math.max(acc / (n - 1), 1e-6);
      this.init = true;
    }
    this.frozen = true;
  }

  reset() {
    this.samples = [];
    this.init = false;
    this.frozen = false;
    this.mean = 0;
    this.var = 1;
  }
}

/** Referencia congelada de medición (misma idea que analyze_session.py). */
export class FeedbackEma {
  constructor() {
    this.att = new BatchZ();
    this.calm = new BatchZ();
  }

  freeze() {
    this.att.freeze();
    this.calm.freeze();
  }

  isFrozen() {
    return this.att.frozen && this.calm.frozen;
  }

  isReady() {
    return this.att.init && this.calm.init;
  }

  snapshot() {
    return {
      calm_mean: this.calm.mean,
      calm_var: this.calm.var,
      att_mean: this.att.mean,
      att_var: this.att.var,
    };
  }

  reset() {
    this.att.reset();
    this.calm.reset();
  }
}

/**
 * Umbral adaptativo para orbe/audio (shaping ~70 % de aciertos).
 * Independiente de la medición vs línea base.
 */
export class AdaptiveShaper {
  constructor({ targetHitRate = NF_SHAPE_HIT_RATE } = {}) {
    this.targetHitRate = targetHitRate;
    this.threshold = null;
    this.sd = 0.4;
    this.recent = [];
  }

  reset() {
    this.threshold = null;
    this.sd = 0.4;
    this.recent = [];
  }

  seed(mean, sd) {
    this.threshold = Number.isFinite(mean) ? mean : 0;
    this.sd = Math.max(Number.isFinite(sd) ? sd : 0.4, 0.12);
    this.recent = [];
  }

  update(x) {
    if (!Number.isFinite(x) || this.threshold == null) return;
    this.recent.push(x);
    if (this.recent.length > 24) this.recent.shift();
    if (this.recent.length >= 4) {
      const m = this.recent.reduce((a, b) => a + b, 0) / this.recent.length;
      let acc = 0;
      for (const v of this.recent) acc += (v - m) * (v - m);
      this.sd = Math.max(Math.sqrt(acc / this.recent.length), 0.12);
    }
    const hit = x >= this.threshold;
    const missRate = 1 - this.targetHitRate;
    const up = 0.05 * this.sd;
    const down = missRate > 0 ? (up * this.targetHitRate) / missRate : up;
    this.threshold += hit ? up : -down;
  }

  level(x) {
    if (this.threshold == null || !Number.isFinite(x)) return 0.38;
    return 1 / (1 + Math.exp(-(x - this.threshold) / this.sd));
  }
}

export function sumSpectrumPower(spectrum, fs, startFreq, endFreq, fftSize = NF_LIVE_FFT_SIZE) {
  const freqResolution = fs / fftSize;
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
export function computeBandPercentages(spectrum, fs = NF_SAMPLE_RATE, fftSize = NF_LIVE_FFT_SIZE) {
  const [rangeLo, rangeHi] = NF_POWER_RANGE;
  const hiEff = Math.min(rangeHi, fs / 2 - 0.1);
  const total = sumSpectrumPower(spectrum, fs, rangeLo, hiEff, fftSize);
  if (total <= 1e-12) return [0, 0, 0, 0];

  const raw = NF_BAND_ORDER.map((name) => {
    const [lo, hi] = NF_BANDS[name];
    const bp = sumSpectrumPower(spectrum, fs, lo, Math.min(hi, hiEff), fftSize);
    return (bp / total) * 100;
  });

  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum <= 0) return [0, 0, 0, 0];
  return raw.map((v) => (v * 100) / sum);
}

export function hannWindow(buffer, fftSize = NF_LIVE_FFT_SIZE) {
  const out = buffer.slice(-fftSize);
  for (let n = 0; n < fftSize; n++) {
    out[n] *= 0.5 * (1 - Math.cos((2 * Math.PI * n) / (fftSize - 1)));
  }
  return out;
}

function hannNormSquared(n) {
  let s = 0;
  for (let i = 0; i < n; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    s += w * w;
  }
  return s / n;
}

/** Integra PSD por banda (trapezoidal), como band_powers_subset_percent en Python. */
function bandPowersFromPsd(psd, fs, nfft) {
  const df = fs / nfft;
  const nBins = psd.length;
  const freqs = Array.from({ length: nBins }, (_, i) => i * df);
  const [rangeLo, rangeHi] = NF_POWER_RANGE;
  const hiEff = Math.min(rangeHi, fs / 2 - 0.1);

  const integrate = (lo, hi) => {
    let sum = 0;
    for (let i = 0; i < nBins - 1; i++) {
      const f0 = freqs[i];
      const f1 = freqs[i + 1];
      if (f1 < lo || f0 > hi) continue;
      const y0 = f0 >= lo && f0 <= hi ? psd[i] : 0;
      const y1 = f1 >= lo && f1 <= hi ? psd[i + 1] : 0;
      sum += ((y0 + y1) / 2) * df;
    }
    return sum;
  };

  let total = 0;
  for (let f = rangeLo; f < hiEff; f += df) {
    const idx = Math.min(nBins - 1, Math.floor(f / df));
    total += psd[idx] * df;
  }
  if (total <= 1e-12) return [0, 0, 0, 0];

  const raw = NF_BAND_ORDER.map((name) => {
    const [lo, hi] = NF_BANDS[name];
    const bp = integrate(lo, Math.min(hi, hiEff));
    return (bp / total) * 100;
  });
  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum <= 0) return [0, 0, 0, 0];
  return raw.map((v) => (v * 100) / sum);
}

/**
 * Welch en vivo (50 % solape, nperseg = 1 s) — alineado con scipy.signal.welch.
 * @param {Float32Array|number[]} samples
 * @param {(windowed: Float32Array) => Float32Array} forwardFft magnitudes length nfft/2
 */
export function welchBandPowers(
  samples,
  forwardFft,
  fs = NF_SAMPLE_RATE,
  fftSize = NF_LIVE_FFT_SIZE,
) {
  const n = samples.length;
  if (n < 16) return [0, 0, 0, 0];
  const nperseg = Math.max(16, Math.min(n, Math.floor(fs * NF_LIVE_WINDOW_SEC), fftSize));
  const noverlap = Math.floor(nperseg / 2);
  const step = Math.max(1, nperseg - noverlap);
  const nBins = Math.floor(nperseg / 2);
  const psdAcc = new Float64Array(nBins);
  const scale = 1 / (fs * hannNormSquared(nperseg));
  let nSeg = 0;

  for (let start = 0; start + nperseg <= n; start += step) {
    const seg = samples.slice(start, start + nperseg);
    const windowed = hannWindow(seg, nperseg);
    const spec = forwardFft(windowed);
    for (let i = 0; i < nBins && i < spec.length; i++) {
      psdAcc[i] += spec[i] * spec[i] * scale;
    }
    nSeg++;
  }
  if (!nSeg) return [0, 0, 0, 0];
  for (let i = 0; i < nBins; i++) psdAcc[i] /= nSeg;
  return bandPowersFromPsd(psdAcc, fs, nperseg);
}

/** Pico a pico (µV) en una ventana — mismo criterio que analyze_session.py. */
export function peakToPeakUv(samples) {
  if (!samples?.length) return 0;
  let min = samples[0];
  let max = samples[0];
  for (let i = 1; i < samples.length; i++) {
    const v = samples[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return max - min;
}

export function detectHeadMotion(accelSamples, gyroSamples) {
  const acc = accelSamples || [];
  for (const s of acc) {
    const mag = Math.hypot(s[0] ?? 0, s[1] ?? 0, s[2] ?? 0);
    if (Math.abs(mag - 1) >= NF_MOTION_ACCEL_G) return true;
  }
  const gyr = gyroSamples || [];
  for (const s of gyr) {
    const mag = Math.hypot(s[0] ?? 0, s[1] ?? 0, s[2] ?? 0);
    if (mag >= NF_MOTION_GYRO_DPS) return true;
  }
  return false;
}

function zeroCrossings(samples) {
  let n = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    if ((a < 0 && b >= 0) || (a > 0 && b <= 0)) n += 1;
  }
  return n;
}

/**
 * Parpadeo frontal: ~150–200 µV en <400 ms (no alpha lenta de ojos cerrados).
 * Un seno 10 Hz cruza cero ~8 veces en 400 ms; un parpadeo, 1–2.
 */
export function detectBlink(buffers, fs = NF_SAMPLE_RATE) {
  const nWin = Math.max(8, Math.round((fs * NF_BLINK_WINDOW_MS) / 1000));
  const nRise = Math.max(2, Math.round((fs * NF_BLINK_RISE_MS) / 1000));
  for (const ch of ['FP1', 'FP2']) {
    const buf = buffers?.[ch];
    if (!buf || buf.length < nWin) continue;
    const win = buf.slice(-nWin);
    if (peakToPeakUv(win) < NF_BLINK_P2P_UV) continue;
    if (zeroCrossings(win) > 3) continue;
    let maxRise = 0;
    for (let i = nRise; i < win.length; i++) {
      maxRise = Math.max(maxRise, Math.abs(win[i] - win[i - nRise]));
    }
    if (maxRise >= NF_BLINK_RISE_UV) return true;
  }
  return false;
}

/**
 * Artefacto: IMU, parpadeo frontal, movimiento p2p o EMG mandibular.
 * @returns {{ artifact: boolean, kind: 'motion'|'emg'|'blink'|null }}
 */
export function detectArtifact(
  buffers,
  channels,
  bars,
  threshold = NF_ARTIFACT_P2P_UV,
  fftSize = NF_LIVE_FFT_SIZE,
  extras = {},
) {
  if (detectHeadMotion(extras.accelSamples, extras.gyroSamples)) {
    return { artifact: true, kind: 'motion' };
  }
  if (detectBlink(buffers)) {
    return { artifact: true, kind: 'blink' };
  }
  let maxP2p = 0;
  for (const ch of channels) {
    const buf = buffers[ch];
    if (!buf || buf.length < Math.min(64, fftSize)) continue;
    maxP2p = Math.max(maxP2p, peakToPeakUv(buf.slice(-fftSize)));
  }
  const betaPct = bars[3] ?? 0;
  if (maxP2p > threshold) {
    return { artifact: true, kind: 'motion' };
  }
  if (betaPct > NF_EMG_BETA_PCT && maxP2p > NF_EMG_P2P_UV) {
    return { artifact: true, kind: 'emg' };
  }
  return { artifact: false, kind: null };
}

/** @deprecated Usar detectArtifact */
export function isArtifactWindow(buffers, channels, threshold = NF_ARTIFACT_P2P_UV, fftSize = NF_LIVE_FFT_SIZE) {
  return detectArtifact(buffers, channels, [0, 0, 0, 0], threshold, fftSize).artifact;
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
 * Índice de medición (0–100 %) vs referencia congelada.
 * Tras freeze(), z es contra el lote de línea base; updateEma solo acumula muestras.
 * @param {{ updateEma?: boolean }} [options]
 */
export function computeFeedbackMetrics(protocol, bars, ema = null, options = {}) {
  const { updateEma = true } = options;
  const { attIdx, calmIdx } = indicesFromBands(bars);
  if (ema && updateEma) {
    ema.att.update(attIdx);
    ema.calm.update(calmIdx);
  }
  if (protocol === 'atencion') {
    const z = ema ? ema.att.z(attIdx) : attIdx;
    const percent = Math.round(100 * sigmoid(z));
    return { percent, level: percent / 100, z, attIdx, calmIdx };
  }
  const z = ema ? ema.calm.z(calmIdx) : calmIdx;
  const percent = Math.round(100 * sigmoid(z));
  return { percent, level: percent / 100, z, attIdx, calmIdx };
}
