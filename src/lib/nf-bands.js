/**
 * Presets NF alineados con foco TDAH / trauma.
 * Mantener coherente con python/analyze_session.py y nf-signal.js.
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
    label: 'Relajación (trauma)',
    shortLabel: 'Relajación',
    description: 'Regulación fisiológica: más alpha + theta',
    pctLabel: 'relajación',
    pctHint: 'alpha + theta',
  },
};

/** Electrodos activos por defecto al elegir protocolo (alineado con análisis Python). */
export const NF_PROTOCOL_ELECTRODES = {
  relajacion: { FP1: true, FP2: true, TP9: true, TP10: true },
  atencion: { FP1: true, FP2: true, TP9: false, TP10: false },
};

export function nfPreset(id) {
  return NF_PROTOCOL_PRESETS[id] || NF_PROTOCOL_PRESETS.relajacion;
}
