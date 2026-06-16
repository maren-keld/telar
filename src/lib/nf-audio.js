/**
 * Retroalimentación sonora local (NF-2) — sin CDN.
 */
const BASE = 'assets/audio';

let feedbackTrack = null;
let connectedSound = null;
let lowBatterySound = null;
let disconnectSound = null;
let lowBatteryPlayed = false;
let audioEnabled = false;

function track(path, loop = false) {
  const a = new Audio(`${BASE}/${path}`);
  a.loop = loop;
  a.preload = 'auto';
  return a;
}

export function initNfAudio() {
  if (feedbackTrack) return;
  feedbackTrack = track('feedback-relaxation.mp3', true);
  connectedSound = track('connected.wav');
  lowBatterySound = track('low-battery.wav');
  disconnectSound = track('disconnected.wav');
}

export function isAudioFeedbackEnabled() {
  return audioEnabled;
}

export function setAudioFeedbackEnabled(on) {
  audioEnabled = Boolean(on);
  if (audioEnabled) {
    enableAudioFeedback();
  } else {
    stopAudioFeedback();
  }
}

export function setNfAudioProtocol(_p) {
  /* reservado — volumen depende del level calculado en nf-session */
}

export function playConnectedSound() {
  initNfAudio();
  lowBatteryPlayed = false;
  connectedSound?.play().catch(() => {});
}

export function playDisconnectSound() {
  initNfAudio();
  stopAudioFeedback();
  disconnectSound?.play().catch(() => {});
}

export function playLowBatterySound() {
  initNfAudio();
  if (lowBatteryPlayed) return;
  lowBatteryPlayed = true;
  lowBatterySound?.play().catch(() => {});
}

export function resetLowBatteryFlag() {
  lowBatteryPlayed = false;
}

/** level 0–1 — curva cúbica para que 25–35 % suene claramente más bajo que 80 %+ */
function volumeFromLevel(level) {
  const clamped = Math.max(0, Math.min(1, level));
  return Math.min(0.82, clamped ** 3);
}

/** @param {number} level 0–1 (ya calculado con computeFeedbackMetrics) */
export function applyAudioFeedback(level) {
  if (!audioEnabled || !feedbackTrack || feedbackTrack.muted) return;
  const target = volumeFromLevel(level);

  const smooth = 0.14;
  const nextVol = feedbackTrack.volume + (target - feedbackTrack.volume) * smooth;
  if (nextVol < 0.008) {
    feedbackTrack.volume = 0;
    if (!feedbackTrack.paused) feedbackTrack.pause();
    return;
  }
  if (feedbackTrack.paused) feedbackTrack.play().catch(() => {});
  feedbackTrack.volume = nextVol;
}

export function enableAudioFeedback() {
  initNfAudio();
  if (!feedbackTrack) return;
  feedbackTrack.muted = false;
  feedbackTrack.volume = 0;
  feedbackTrack.pause();
}

export function stopAudioFeedback() {
  if (!feedbackTrack) return;
  feedbackTrack.muted = true;
  feedbackTrack.pause();
  feedbackTrack.currentTime = 0;
  feedbackTrack.volume = 0;
}
