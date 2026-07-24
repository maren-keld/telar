/**
 * Presets NF alineados con foco TDAH / trauma.
 * Mantener coherente con python/analyze_session.py y nf-signal.js.
 */
export const NF_SAMPLE_RATE = 256;
/** Referencia histórica / documentación; el vivo usa NF_LIVE_FFT_SIZE. */
export const NF_FFT_SIZE = 256;
/** Ventana espectral en vivo: 2 s @ 256 Hz (post-sesión usa ventanas de 4 s). */
export const NF_LIVE_FFT_SIZE = 512;

/** Mismo umbral que python/analyze_session.py (µV pico a pico). */
export const NF_ARTIFACT_P2P_UV = 2500;

/** EMG mandibular: beta alta + p2p moderado (NF-15). */
export const NF_EMG_BETA_PCT = 32;
export const NF_EMG_P2P_UV = 1100;

/** Calibración EMA por defecto (ms). Valor en vivo: getNfWarmupMs() en nf-config.js. */
export const NF_WARMUP_MS = 90_000;

/** Suavizado de barras en vivo (menor = más reactivo, mayor = más estable). */
export const NF_BAR_SMOOTH_ALPHA = 0.16;

/** Potencia relativa calculada sobre este rango (Hz). */
export const NF_POWER_RANGE = [0.5, 30];

export const NF_BAND_ORDER = ['Delta', 'Theta', 'Alpha', 'Beta'];

export const NF_BANDS = {
  Delta: [0.5, 4],
  Theta: [4, 8],
  Alpha: [8, 12],
  Beta: [13, 30],
};

/** 50 Hz (CL/EU); 60 Hz (Americas). Ambos en vivo para macOS y Windows. */
export const NF_NOTCH_FREQS = [50, 60];

/** Intervalo de actualización espectral + feedback (ms). */
export const NF_FEEDBACK_INTERVAL_MS = 400;

/** Suavizado del orbe (mayor = menos inercia visual). */
export const NF_ORB_SMOOTH_LEVEL = 0.14;
export const NF_ORB_SMOOTH_PCT = 0.18;

/** Suavizado volumen audio (mayor = respuesta más rápida). */
export const NF_AUDIO_SMOOTH = 0.22;

/** Dispositivo soportado oficialmente. */
export const NF_SUPPORTED_DEVICE = 'Muse 2';

export const NF_PROTOCOL_PRESETS = {
  atencion: {
    id: 'atencion',
    label: 'Atención (TDAH)',
    shortLabel: 'Atención',
    description: 'Entrenamiento de foco: más beta frontal (13–30 Hz)',
    pctLabel: 'atención',
    pctHint: 'beta frontal',
  },
  relajacion: {
    id: 'relajacion',
    label: 'Calma',
    shortLabel: 'Calma',
    description: 'Regulación fisiológica: más alpha + theta',
    pctLabel: 'calma',
    pctHint: 'alpha + theta',
  },
};

/** Electrodos activos por defecto al elegir protocolo (alineado con análisis Python). */
export const NF_PROTOCOL_ELECTRODES = {
  relajacion: { FP1: true, FP2: true, TP9: true, TP10: true },
  atencion: { FP1: true, FP2: true, TP9: false, TP10: false },
};

/** Canales para feedback en vivo (mismo criterio que analyze_session.py). */
export const NF_LIVE_FEEDBACK_CHANNELS = {
  relajacion: ['TP9', 'TP10'],
  atencion: ['FP2'],
};

export function nfPreset(id) {
  return NF_PROTOCOL_PRESETS[id] || NF_PROTOCOL_PRESETS.relajacion;
}
