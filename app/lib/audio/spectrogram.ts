// Offline spectrogram analysis. Decodes an audio URL into a grid of
// frequency-intensity columns we can paint as a heatmap with a playhead. The
// fetch/decode (and the reason it never taps the live <audio> element) lives in
// lib/audio/decode.

import { decodeAudio } from '@/lib/audio/decode'
import { hannWindow, RealFFT } from '@/lib/audio/fft'

export interface SpectrogramData {
  // Row-major intensity grid, data[col * bins + bin] in 0..1. Bin 0 is the
  // lowest frequency, so callers paint it at the bottom.
  data: Float32Array
  columns: number
  bins: number
}

// Fixed analysis resolution. Columns are resampled across the whole track so the
// image has the same detail regardless of duration; the canvas stretches it.
const COLUMNS = 900
const FFT_SIZE = 2048
const HALF = FFT_SIZE / 2
const OUT_BINS = 256
// dB window the magnitudes are normalized into. Anything quieter than FLOOR_DB
// clamps to black, MAX_DB to full intensity.
const FLOOR_DB = -90
const MAX_DB = -20

// Computed grids keyed by src so reopening the same track is instant.
const cache = new Map<string, SpectrogramData>()
const inflight = new Map<string, Promise<SpectrogramData>>()

// Precomputed Hann window so we taper each frame the same way every column.
const hann = hannWindow(FFT_SIZE)

function analyze(buffer: AudioBuffer): SpectrogramData {
  // Mono mixdown so a center-panned vocal and a hard-panned guitar read the
  // same. Most of our audio is mono or near-mono anyway.
  const channels = buffer.numberOfChannels
  const length = buffer.length
  const mono = new Float32Array(length)
  for (let c = 0; c < channels; c++) {
    const ch = buffer.getChannelData(c)
    for (let i = 0; i < length; i++)
      mono[i]! += ch[i]! / channels
  }

  const data = new Float32Array(COLUMNS * OUT_BINS)
  const transform = new RealFFT(FFT_SIZE)
  const frame = new Float32Array(FFT_SIZE)
  const mags = new Float32Array(HALF)
  // Pool the linear FFT bins down to OUT_BINS. HALF (1024) into 256 is a clean
  // 4:1, but keep it general.
  const perBin = HALF / OUT_BINS

  for (let col = 0; col < COLUMNS; col++) {
    // Center the analysis window on this column's position in the track.
    const center = Math.floor(((col + 0.5) / COLUMNS) * length)
    const start = center - HALF
    for (let i = 0; i < FFT_SIZE; i++) {
      const s = start + i
      const sample = s >= 0 && s < length ? mono[s]! : 0
      frame[i] = sample * hann[i]!
    }

    transform.magnitudes(frame, mags)

    for (let b = 0; b < OUT_BINS; b++) {
      // Max-pool the source bins so a sharp tone doesn't wash out when several
      // map to one output row.
      let mag = 0
      const from = Math.floor(b * perBin)
      const to = Math.floor((b + 1) * perBin)
      for (let k = from; k < to; k++) {
        if (mags[k]! > mag)
          mag = mags[k]!
      }
      const db = 20 * Math.log10(mag + 1e-9)
      const norm = Math.max(0, Math.min(1, (db - FLOOR_DB) / (MAX_DB - FLOOR_DB)))
      data[col * OUT_BINS + b] = norm
    }
  }

  return { data, columns: COLUMNS, bins: OUT_BINS }
}

// Decode and analyze a track, caching the result. Rejects if the file can't be
// fetched (e.g. cross-origin without CORS) or decoded; callers should treat that
// as "no spectrogram available" and degrade gracefully.
export async function computeSpectrogram(src: string): Promise<SpectrogramData> {
  const cached = cache.get(src)
  if (cached)
    return cached

  const existing = inflight.get(src)
  if (existing)
    return existing

  const job = (async () => {
    const buffer = await decodeAudio(src)
    const result = analyze(buffer)
    cache.set(src, result)
    return result
  })()

  inflight.set(src, job)
  try {
    return await job
  }
  finally {
    inflight.delete(src)
  }
}
