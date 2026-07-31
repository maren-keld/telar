import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeBandPercentages,
  detectArtifact,
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

test('artifact detector separates motion, EMG, and clean windows', () => {
  const clean = sineRecording(10, 2, 50);
  const emgAmplitude = 650;
  const emg = sineRecording(20, 2, emgAmplitude);
  const motion = Float32Array.from({ length: 512 }, (_, i) => (i % 2 ? 1600 : -1600));

  assert.deepEqual(detectArtifact({ TP9: clean }, ['TP9'], [0, 0, 80, 5]), {
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
});

test('peak-to-peak is deterministic for recorded samples', () => {
  assert.equal(peakToPeakUv([-10, 5, 20, -4]), 30);
  assert.equal(peakToPeakUv([]), 0);
});
