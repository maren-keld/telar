import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AdaptiveShaper,
  computeBandPercentages,
  computeFeedbackMetrics,
  detectArtifact,
  detectBlink,
  FeedbackEma,
  peakToPeakUv,
  welchBandPowers,
} from '../../src/lib/nf-signal.js';
import { NF_LIVE_FFT_SIZE, NF_SAMPLE_RATE } from '../../src/lib/nf-bands.js';

function sineRecording(frequencyHz, seconds = 2, amplitudeUv = 100) {
  return Float32Array.from(
    { length: NF_SAMPLE_RATE * seconds },
    (_, index) => amplitudeUv * Math.sin((2 * Math.PI * frequencyHz * index) / NF_SAMPLE_RATE),
  );
}

function blinkPulse({ p2pUv = 200, durationMs = 150, totalSec = 2 } = {}) {
  const n = NF_SAMPLE_RATE * totalSec;
  const pulseN = Math.round((NF_SAMPLE_RATE * durationMs) / 1000);
  const start = n - pulseN - 8;
  const arr = new Float32Array(n);
  for (let i = 0; i < pulseN && start + i < n; i++) {
    arr[start + i] = p2pUv * Math.sin((Math.PI * i) / pulseN);
  }
  return arr;
}

function dftMagnitudes(samples) {
  const bins = Math.floor(samples.length / 2);
  const magnitudes = new Float32Array(bins);
  for (let k = 0; k < bins; k++) {
    let real = 0;
    let imaginary = 0;
    for (let n = 0; n < samples.length; n++) {
      const angle = (-2 * Math.PI * k * n) / samples.length;
      real += samples[n] * Math.cos(angle);
      imaginary += samples[n] * Math.sin(angle);
    }
    magnitudes[k] = Math.hypot(real, imaginary);
  }
  return magnitudes;
}

test('deterministic 10 Hz spectrum is classified as alpha', () => {
  const spectrum = new Float32Array(NF_LIVE_FFT_SIZE / 2);
  const alphaBin = Math.round(10 / (NF_SAMPLE_RATE / NF_LIVE_FFT_SIZE));
  spectrum[alphaBin] = 1;

  const [delta, theta, alpha, beta] = computeBandPercentages(spectrum);

  assert.ok(alpha > 99);
  assert.ok(delta < 1 && theta < 1 && beta < 1);
});

test('Welch classifies a deterministic 10 Hz recording as alpha', () => {
  const bands = welchBandPowers(sineRecording(10), dftMagnitudes);
  const total = bands.reduce((sum, value) => sum + value, 0);

  assert.ok(bands[2] > 95, `expected alpha dominance, got ${bands}`);
  assert.ok(Math.abs(total - 100) < 0.001);
});

test('artifact detector separates motion, EMG, blink, and clean windows', () => {
  const clean = sineRecording(10, 2, 50);
  const emgAmplitude = 115;
  const emg = sineRecording(20, 2, emgAmplitude);
  const motion = Float32Array.from({ length: 512 }, (_, i) => (i % 2 ? 200 : -200));
  const blink = blinkPulse({ p2pUv: 200 });

  assert.deepEqual(detectArtifact({ TP9: clean, FP1: clean, FP2: clean }, ['TP9'], [0, 0, 80, 5]), {
    artifact: false,
    kind: null,
  });
  assert.deepEqual(detectArtifact({ TP9: emg }, ['TP9'], [0, 0, 10, 40]), {
    artifact: true,
    kind: 'emg',
  });
  assert.deepEqual(detectArtifact({ TP9: motion }, ['TP9'], [0, 0, 10, 20]), {
    artifact: true,
    kind: 'motion',
  });
  assert.equal(detectBlink({ FP1: blink, FP2: clean }), true);
  assert.deepEqual(detectArtifact({ TP9: clean, FP1: blink, FP2: clean }, ['TP9'], [0, 0, 80, 5]), {
    artifact: true,
    kind: 'blink',
  });
});

test('a 200 µV blink is an artifact; clean eyes-closed alpha is not', () => {
  const blink = blinkPulse({ p2pUv: 200 });
  const alpha = sineRecording(10, 2, 40);
  assert.equal(detectBlink({ FP1: blink, FP2: alpha }), true);
  assert.equal(detectBlink({ FP1: alpha, FP2: alpha }), false);
});

test('after freezing EMA, a held state does not drift back to 50%', () => {
  const ema = new FeedbackEma();
  const baselineBars = [10, 20, 60, 10];
  const trainedBars = [10, 10, 15, 65];
  for (let i = 0; i < 80; i++) {
    computeFeedbackMetrics('relajacion', baselineBars, ema, { updateEma: true });
  }
  ema.freeze();
  const first = computeFeedbackMetrics('relajacion', trainedBars, ema, { updateEma: false });
  for (let i = 0; i < 80; i++) {
    computeFeedbackMetrics('relajacion', trainedBars, ema, { updateEma: true });
  }
  const last = computeFeedbackMetrics('relajacion', trainedBars, ema, { updateEma: true });
  assert.equal(first.percent, last.percent);
  assert.ok(last.percent < 45, `held low-calm state should stay below 50, got ${last.percent}`);
});

test('z is against frozen baseline stats, not a moving window', () => {
  const ema = new FeedbackEma();
  const baselineBars = [12, 18, 55, 15];
  for (let i = 0; i < 60; i++) {
    computeFeedbackMetrics('relajacion', baselineBars, ema, { updateEma: true });
  }
  ema.freeze();
  const meanBefore = ema.calm.mean;
  const trainedBars = [8, 10, 20, 62];
  computeFeedbackMetrics('relajacion', trainedBars, ema, { updateEma: true });
  assert.equal(ema.calm.mean, meanBefore);
  assert.equal(ema.isFrozen(), true);
  assert.ok(meanBefore !== 0);
});

test('batch freeze uses the whole baseline, not only the last seconds', () => {
  const ema = new FeedbackEma();
  const early = [8, 12, 70, 10];
  const late = [25, 30, 20, 25];
  for (let i = 0; i < 40; i++) {
    computeFeedbackMetrics('relajacion', early, ema, { updateEma: true });
  }
  for (let i = 0; i < 8; i++) {
    computeFeedbackMetrics('relajacion', late, ema, { updateEma: true });
  }
  ema.freeze();
  const earlyMetrics = computeFeedbackMetrics('relajacion', early, ema, { updateEma: false });
  const lateMetrics = computeFeedbackMetrics('relajacion', late, ema, { updateEma: false });
  assert.ok(earlyMetrics.percent > 55, `early calm state should stay above 50 vs batch mean, got ${earlyMetrics.percent}`);
  assert.ok(lateMetrics.percent < 45, `late mixed state should stay below 50 vs batch mean, got ${lateMetrics.percent}`);
});

test('adaptive shaper raises the threshold when the person is always above it', () => {
  const shaper = new AdaptiveShaper({ targetHitRate: 0.7 });
  shaper.seed(0, 0.4);
  const start = shaper.threshold;
  for (let i = 0; i < 40; i++) shaper.update(1.2);
  assert.ok(shaper.threshold > start, `threshold should climb, ${start} -> ${shaper.threshold}`);
  const high = shaper.level(1.2);
  const low = shaper.level(-0.5);
  assert.ok(high > low);
  assert.ok(high > 0.5);
});

test('peak-to-peak is deterministic for recorded samples', () => {
  assert.equal(peakToPeakUv([-10, 5, 20, -4]), 30);
  assert.equal(peakToPeakUv([]), 0);
});
