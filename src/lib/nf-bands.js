/**
 * Presets NF alineados con foco TDAH / trauma.
 * Mantener coherente con python/analyze_session.py y nf-signal.js.
 */
export const NF_SAMPLE_RATE = 256;
/** Referencia histórica / documentación; el vivo usa NF_LIVE_FFT_SIZE. */
export const NF_FFT_SIZE = 256;
/** Ventana espectral en vivo: 1 s @ 256 Hz (menor latencia del orbe). */
export const NF_LIVE_WINDOW_SEC = 1;
export const NF_LIVE_FFT_SIZE = 256;

/**
 * Umbrales de artefacto — mismos números que python/analyze_session.py.
 * Muse 2 satura ~±1000 µV; un parpadeo típico es ~200 µV.
 */
/** Movimiento: p2p en ventana de 2 s (canales de feedback). */
export const NF_ARTIFACT_P2P_UV = 250;
/** EMG mandibular: beta alta + p2p alcanzable (no 1100). */
export const NF_EMG_BETA_PCT = 32;
export const NF_EMG_P2P_UV = 220;
/** Parpadeo frontal (FP1/FP2): deflexión en <400 ms. */
export const NF_BLINK_P2P_UV = 150;
export const NF_BLINK_WINDOW_MS = 400;
export const NF_BLINK_RISE_MS = 40;
export const NF_BLINK_RISE_UV = 100;
/** IMU: desviación de 1 g / velocidad angular. */
export const NF_MOTION_ACCEL_G = 0.18;
export const NF_MOTION_GYRO_DPS = 40;
/** Sin muestras EEG → «sin señal». */
export const NF_SIGNAL_WATCHDOG_MS = 2000;
export const NF_NOMINAL_FS = 256;
export const NF_FS_DEV_WARN = 0.02;
/** «En estado» vs línea base congelada: z > 0 (sobre la media). */
export const NF_STATE_Z = 0;

/** Suavizado de barras en vivo (mayor = más reactivo). */
export const NF_BAR_SMOOTH_ALPHA = 0.4;

/** Potencia relativa calculada sobre este rango (Hz). */
export const NF_POWER_RANGE = [0.5, 30];

export const NF_BAND_ORDER = ['Delta', 'Theta', 'Alpha', 'Beta'];

export const NF_BANDS = {
  Delta: [0.5, 4],
  Theta: [4, 8],
  Alpha: [8, 12],
  /** Beta angosta: menos EMG mandibular que 13–30 Hz. */
  Beta: [15, 20],
};

/** 50 Hz (CL/EU); 60 Hz (Americas). Ambos en vivo para macOS y Windows. */
export const NF_NOTCH_FREQS = [50, 60];

/** Intervalo de actualización espectral + feedback (ms). */
export const NF_FEEDBACK_INTERVAL_MS = 250;

/** Suavizado del orbe (mayor = menos inercia visual). */
export const NF_ORB_SMOOTH_LEVEL = 0.28;
export const NF_ORB_SMOOTH_PCT = 0.32;

/** Éxito objetivo del orbe/audio (shaping), no de la medición. */
export const NF_SHAPE_HIT_RATE = 0.7;

/** Suavizado volumen audio (mayor = respuesta más rápida). */
export const NF_AUDIO_SMOOTH = 0.22;

/** Dispositivo soportado oficialmente. */
export const NF_SUPPORTED_DEVICE = 'Muse 2';

export const NF_MEDICAL_DISCLAIMER =
  'Bienestar y autorregulación — no es dispositivo médico.';

export const NF_HELP_MESSAGE =
  'Solo Muse 2. BLE nativo en macOS/Windows. Bienestar y autorregulación — no es dispositivo médico. Conecta el Muse, pulsa «Iniciar entrenamiento» (ojos abiertos, mirá el orbe ~2–3 min), luego «Grabar sesión». Evita parpadear o tensar la mandíbula.';

/** Línea base y entrenamiento en la misma condición (efecto Berger). */
export const NF_EYE_CONDITION = 'open';
export const NF_EYE_CONDITION_LABEL = 'Ojos abiertos (mirá el orbe)';

export const NF_PROTOCOL_PRESETS = {
  atencion: {
    id: 'atencion',
    label: 'Atención (TDAH)',
    shortLabel: 'Atención',
    description: 'Entrenamiento de foco: más beta frontal 15–20 Hz (FP1+FP2) frente a theta/delta',
    pctLabel: 'atención',
    pctHint: 'beta 15–20 Hz · FP1+FP2',
  },
  relajacion: {
    id: 'relajacion',
    label: 'Calma',
    shortLabel: 'Calma',
    description: 'Más alpha + theta frente a beta en sienes (misma condición que el reposo)',
    pctLabel: 'calma',
    pctHint: 'alpha + theta · TP9/TP10',
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
  atencion: ['FP1', 'FP2'],
};

export function nfPreset(id) {
  return NF_PROTOCOL_PRESETS[id] || NF_PROTOCOL_PRESETS.relajacion;
}
