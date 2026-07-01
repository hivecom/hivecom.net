// FFT helpers for the audio visualizations, backed by fft.js (battle-tested,
// zero-dependency, real-input transform). The offline spectrogram runs one
// window per track column; the live spectrum runs one per frame at the playhead.

import FFT from 'fft.js'

// A reusable real-input forward FFT for a fixed window size. Feed a windowed
// frame, read back the lower-half magnitudes (the only half we paint, since a
// real signal's spectrum is symmetric). Allocations happen once, not per call.
export class RealFFT {
  readonly size: number
  // Number of usable frequency bins: half the window plus DC.
  readonly bins: number
  private readonly fft: FFT
  private readonly out: number[]

  constructor(size: number) {
    this.size = size
    this.bins = size >> 1
    this.fft = new FFT(size)
    this.out = this.fft.createComplexArray() as number[]
  }

  // Transform `frame` (real, length === size) and write per-bin magnitudes into
  // `mags` (length >= bins). realTransform only fills the lower half, which is
  // all we read.
  magnitudes(frame: Float32Array, mags: Float32Array): void {
    this.fft.realTransform(this.out, frame)
    const out = this.out
    for (let k = 0; k < this.bins; k++) {
      const re = out[2 * k]!
      const im = out[2 * k + 1]!
      mags[k] = Math.hypot(re, im)
    }
  }
}

// A Hann window of the given size, so every frame is tapered the same way.
export function hannWindow(size: number): Float32Array {
  const w = new Float32Array(size)
  for (let i = 0; i < size; i++)
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)))
  return w
}
