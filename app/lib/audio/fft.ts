import FFT from 'fft.js'

// Only the lower half of the magnitudes, since a real signal's spectrum is
// symmetric. Allocates once, not per call.
export class RealFFT {
  readonly size: number

  // Half the window size.
  readonly bins: number
  private readonly fft: FFT
  private readonly out: number[]

  constructor(size: number) {
    this.size = size
    this.bins = size >> 1
    this.fft = new FFT(size)
    this.out = this.fft.createComplexArray() as number[]
  }

  // `frame` must be `size` long and `mags` at least `bins`.
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

export function hannWindow(size: number): Float32Array {
  const w = new Float32Array(size)
  for (let i = 0; i < size; i++)
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)))
  return w
}
