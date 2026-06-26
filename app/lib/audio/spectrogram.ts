// Offline spectrogram analysis. Decodes an audio URL into a grid of
// frequency-intensity columns we can paint as a heatmap with a playhead.
//
// Deliberately runs off the decoded file and never taps the shared playback
// <audio> element with Web Audio. Tapping that element (createMediaElementSource)
// is permanent and per-element, and the engine reuses one element for every
// track, so a single cross-origin track without CORS headers would mute all
// playback from then on. Decoding a copy here keeps visualization fully isolated
// from sound: worst case the fetch fails (CORS) and the caller falls back to a
// plain timeline, audio untouched.

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

// One AudioContext, lazily created, reused for every decode. decodeAudioData
// works on a suspended context, so this never needs a user gesture or makes
// sound.
let decodeCtx: AudioContext | null = null

// Computed grids keyed by src so reopening the same track is instant.
const cache = new Map<string, SpectrogramData>()
const inflight = new Map<string, Promise<SpectrogramData>>()

function getDecodeContext(): AudioContext {
  if (!decodeCtx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    decodeCtx = new Ctor()
  }
  return decodeCtx
}

// Iterative radix-2 Cooley-Tukey FFT, in place on parallel real/imag arrays.
// Length must be a power of two (FFT_SIZE is).
function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1)
      j ^= bit
    j ^= bit
    if (i < j) {
      const tr = re[i]!
      re[i] = re[j]!
      re[j] = tr
      const ti = im[i]!
      im[i] = im[j]!
      im[j] = ti
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wRe = Math.cos(ang)
    const wIm = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let curRe = 1
      let curIm = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k
        const b = i + k + len / 2
        const reB = re[b]!
        const imB = im[b]!
        const tRe = reB * curRe - imB * curIm
        const tIm = reB * curIm + imB * curRe
        re[b] = re[a]! - tRe
        im[b] = im[a]! - tIm
        re[a] = re[a]! + tRe
        im[a] = im[a]! + tIm
        const nextRe = curRe * wRe - curIm * wIm
        curIm = curRe * wIm + curIm * wRe
        curRe = nextRe
      }
    }
  }
}

// Precomputed Hann window so we taper each frame the same way every column.
const hann = new Float32Array(FFT_SIZE)
for (let i = 0; i < FFT_SIZE; i++)
  hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)))

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
  const re = new Float32Array(FFT_SIZE)
  const im = new Float32Array(FFT_SIZE)
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
      re[i] = sample * hann[i]!
      im[i] = 0
    }

    fft(re, im)

    for (let b = 0; b < OUT_BINS; b++) {
      // Max-pool the source bins so a sharp tone doesn't wash out when several
      // map to one output row.
      let mag = 0
      const from = Math.floor(b * perBin)
      const to = Math.floor((b + 1) * perBin)
      for (let k = from; k < to; k++) {
        const m = Math.hypot(re[k]!, im[k]!)
        if (m > mag)
          mag = m
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
    // Fetch off a URL distinct from the one the <audio> element loads. The
    // player loads the file with no Origin (no crossorigin), which can seed the
    // browser cache with a copy that carries no CORS header; a plain fetch of
    // the same URL would reuse it and fail the cross-origin read. A dedicated
    // query param gives this request its own cache entry that goes through CORS
    // cleanly. Depot's nginx keys its download cache on path only, so this never
    // fragments the server-side cache.
    const url = `${src}${src.includes('?') ? '&' : '?'}spectrogram=1`
    const res = await fetch(url)
    if (!res.ok)
      throw new Error(`Failed to fetch audio: ${res.status}`)
    const bytes = await res.arrayBuffer()
    const buffer = await getDecodeContext().decodeAudioData(bytes)
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
