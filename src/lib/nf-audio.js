/**
 * Retroalimentación sonora local (NF-2) — sin CDN.
 */
const BASE = 'assets/audio';

let feedbackTrack = null;
let connectedSound = null;
let lowBatterySound = null;
let disconnectSound = null;
let lowBatteryPlayed = false;
let protocol = 'relajacion';

function track(path, loop = false) {
  const a = new Audio(`${BASE}/${path}`);
  a.loop = loop;
  a.preload = 'auto';
  return a;
}

export function initNfAudio() {
  if (feedbackTrack) return;
  feedbackTrack = track('feedback-relaxation.wav', true);
  connectedSound = track('connected.wav');
  lowBatterySound = track('low-battery.wav');
  disconnectSound = track('disconnected.wav');
}

export function setNfAudioProtocol(p) {
  protocol = p === 'atencion' ? 'atencion' : 'relajacion';
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

/** bars: [delta, theta, alpha, beta] en % */
export function applyAudioFeedback(bars) {
  if (!feedbackTrack || feedbackTrack.muted) return;
  const theta = bars[1] ?? 0;
  const alpha = bars[2] ?? 0;
  const beta = bars[3] ?? 0;
  const calmPct = alpha + theta * 0.5;
  const attentionPct = beta + alpha * 0.3;

  let target = 0;
  if (protocol === 'atencion') {
    target = Math.min(1, attentionPct / 55);
  } else {
    target = Math.min(1, calmPct / 55);
  }

  const smooth = 0.12;
  const nextVol = feedbackTrack.volume + (target - feedbackTrack.volume) * smooth;
  if (nextVol < 0.02) {
    feedbackTrack.volume = 0;
    if (!feedbackTrack.paused) feedbackTrack.pause();
    return;
  }
  if (feedbackTrack.paused) feedbackTrack.play().catch(() => {});
  feedbackTrack.volume = Math.min(1, nextVol);
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
