import assert from 'node:assert/strict';
import test from 'node:test';

import { FFT } from '../../src/lib/nf-fft.js';

test('FFT locates a deterministic sinusoid in the expected bin', () => {
  const size = 512;
  const sampleRate = 256;
  const frequency = 10;
  const input = Float32Array.from(
    { length: size },
    (_, index) => Math.sin((2 * Math.PI * frequency * index) / sampleRate),
  );

  const spectrum = new FFT(size).forward(input);
  const peakBin = spectrum.indexOf(Math.max(...spectrum));

  assert.equal(peakBin, frequency / (sampleRate / size));
  assert.ok(spectrum[peakBin] > 0.99);
});

test('FFT rejects invalid sizes and sample lengths', () => {
  assert.throws(() => new FFT(500), /power of two/);
  assert.throws(() => new FFT(512).forward(new Float32Array(256)), /expected 512 samples/);
});
