/**
 * Bandas EEG compartidas — mantener alineadas con python/analyze_session.py BANDS.
 */
export const NF_SAMPLE_RATE = 256;
export const NF_FFT_SIZE = 256;

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

/** Intervalo de actualización gráfico + audio (ms). */
export const NF_FEEDBACK_INTERVAL_MS = 400;

/** Dispositivo soportado oficialmente. */
export const NF_SUPPORTED_DEVICE = 'Muse 2';
