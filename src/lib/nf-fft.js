/**
 * Radix-2 FFT used by the live neurofeedback pipeline.
 * Returns one-sided magnitudes normalized by the input length.
 */
export class FFT {
  constructor(bufferSize) {
    if (bufferSize < 2 || (bufferSize & (bufferSize - 1)) !== 0) {
      throw new Error('FFT buffer size must be a power of two');
    }
    this.bufferSize = bufferSize;
    this.spectrum = new Float32Array(bufferSize / 2);
    this.real = new Float32Array(bufferSize);
    this.imag = new Float32Array(bufferSize);
    this.reverseTable = new Uint32Array(bufferSize);
    this.sinTable = new Float32Array(bufferSize);
    this.cosTable = new Float32Array(bufferSize);
    let limit = 1;
    let bit = bufferSize >> 1;
    this.reverseTable[0] = 0;
    while (limit < bufferSize) {
      for (let i = 0; i < limit; i++) {
        this.reverseTable[i + limit] = this.reverseTable[i] + bit;
      }
      limit <<= 1;
      bit >>= 1;
    }
    for (let i = 0; i < bufferSize; i++) {
      if (i === 0) {
        this.sinTable[0] = 0;
        this.cosTable[0] = 1;
      } else {
        this.sinTable[i] = Math.sin(-Math.PI / i);
        this.cosTable[i] = Math.cos(-Math.PI / i);
      }
    }
  }

  forward(buffer) {
    if (buffer.length !== this.bufferSize) {
      throw new Error(`FFT expected ${this.bufferSize} samples, received ${buffer.length}`);
    }
    const { real, imag, reverseTable, sinTable, cosTable, spectrum, bufferSize } = this;
    for (let i = 0; i < bufferSize; i++) {
      real[i] = buffer[reverseTable[i]];
      imag[i] = 0;
    }
    let halfSize = 1;
    while (halfSize < bufferSize) {
      const phaseShiftStepReal = cosTable[halfSize];
      const phaseShiftStepImag = sinTable[halfSize];
      let currentPhaseShiftReal = 1;
      let currentPhaseShiftImag = 0;
      for (let fftStep = 0; fftStep < halfSize; fftStep++) {
        for (let i = fftStep; i < bufferSize; i += halfSize << 1) {
          const off = i + halfSize;
          const tr = currentPhaseShiftReal * real[off] - currentPhaseShiftImag * imag[off];
          const ti = currentPhaseShiftReal * imag[off] + currentPhaseShiftImag * real[off];
          real[off] = real[i] - tr;
          imag[off] = imag[i] - ti;
          real[i] += tr;
          imag[i] += ti;
        }
        const previousReal = currentPhaseShiftReal;
        currentPhaseShiftReal =
          previousReal * phaseShiftStepReal - currentPhaseShiftImag * phaseShiftStepImag;
        currentPhaseShiftImag =
          previousReal * phaseShiftStepImag + currentPhaseShiftImag * phaseShiftStepReal;
      }
      halfSize <<= 1;
    }
    for (let i = 0; i < bufferSize / 2; i++) {
      spectrum[i] = (2 * Math.hypot(real[i], imag[i])) / bufferSize;
    }
    return spectrum;
  }
}
