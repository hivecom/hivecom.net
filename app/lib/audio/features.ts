// Per-playhead feature extraction for the smoke visualizer: one windowed FFT at
// the playhead each frame, boiled down to band energies, onsets, brightness and
// three smoothed mood weights. No DOM or WebGL, so it stays testable.

import { hannWindow, RealFFT } from '@/lib/audio/fft'

// 4096 at 44.1k is ~93ms, short enough that frame-to-frame flux still catches
// kicks and hats.
const FFT_SIZE = 4096
const HALF = FFT_SIZE / 2

// The analyzer runs at the frame rate, so the onset envelope is assumed to be
// sampled at 60Hz. Frame-rate wobble only nudges the estimate and the smoothing
// absorbs it. BPM = 60 * onsetRate / lag, so 60-180 BPM is lag 20-60. The ring
// holds ~6s, and autocorrelation runs every ~400ms.
const TEMPO_RING = 384
const ONSET_RATE = 60
const MIN_BPM = 60
const MAX_BPM = 180
const MIN_LAG = Math.floor((60 * ONSET_RATE) / MAX_BPM)
const MAX_LAG = Math.ceil((60 * ONSET_RATE) / MIN_BPM)
const TEMPO_INTERVAL = 24

// In Hz. The engine reads these by name.
const BANDS = [
  { key: 'sub', lo: 20, hi: 60 },
  { key: 'bass', lo: 60, hi: 160 },
  { key: 'lowMid', lo: 160, hi: 500 },
  { key: 'mid', lo: 500, hi: 2000 },
  { key: 'high', lo: 2000, hi: 6000 },
  { key: 'air', lo: 6000, hi: 14000 },
] as const

type BandKey = (typeof BANDS)[number]['key']

export interface AudioFeatures {
  // Smoothed, 0..1.
  energy: number

  // Raw level this frame, 0..1. Not adaptively normalized.
  level: number

  // Each 0..1 after adaptive normalization.
  bands: Record<BandKey, number>
  // Spectral flux, 0..1.
  onset: number

  // Low-end transient, 0..1.
  bassHit: number

  // High-end transient, 0..1.
  highHit: number

  // 0 bass-heavy, 1 airy.
  brightness: number

  // Mood weights, each 0..1 and summing to 1.
  flow: number
  splatter: number
  geometry: number

  // 0 until there's a confident estimate.
  bpm: number

  // 0..1 within the current beat. Stays 0 while bpm is 0.
  beatPhase: number
}

// Every mood weight is 0 here so the field just settles and fades. The
// analyzer's own default seeds flow at 1 instead.
export const IDLE_FEATURES: AudioFeatures = {
  energy: 0,
  level: 0,
  bands: { sub: 0, bass: 0, lowMid: 0, mid: 0, high: 0, air: 0 },
  onset: 0,
  bassHit: 0,
  highHit: 0,
  brightness: 0.5,
  flow: 0,
  splatter: 0,
  geometry: 0,
  bpm: 0,
  beatPhase: 0,
}

// Attack/decay smoother with an adaptive ceiling, so loud and quiet tracks both
// map into 0..1.
class Tracker {
  value = 0
  private ceiling = 1e-3
  constructor(private readonly attack: number, private readonly decay: number) {}

  push(raw: number): number {
    // Leaks down slowly so a track that gets quieter re-sensitizes.
    this.ceiling = Math.max(raw, this.ceiling * 0.9995)
    const norm = this.ceiling > 1e-6 ? raw / this.ceiling : 0
    const a = norm > this.value ? this.attack : this.decay
    this.value += (norm - this.value) * a
    return this.value
  }

  reset() {
    this.value = 0
    this.ceiling = 1e-3
  }
}

export class FeatureAnalyzer {
  private readonly hann = hannWindow(FFT_SIZE)
  private readonly fft = new RealFFT(FFT_SIZE)
  private readonly frame = new Float32Array(FFT_SIZE)
  private readonly mags = new Float32Array(HALF)
  private readonly prevMags = new Float32Array(HALF)
  private hasPrev = false

  private readonly bandLo = new Int32Array(BANDS.length)
  private readonly bandHi = new Int32Array(BANDS.length)

  private samples: Float32Array | null = null
  private sampleCount = 0
  private sampleRate = 44100

  private readonly bandTrackers = BANDS.map(() => new Tracker(0.6, 0.12))
  private readonly energyTracker = new Tracker(0.5, 0.05)
  private readonly onsetTracker = new Tracker(0.8, 0.18)
  private readonly bassHitTracker = new Tracker(0.9, 0.4)
  private readonly highHitTracker = new Tracker(0.85, 0.2)

  // Slow-moving so the mood doesn't flicker frame to frame.
  private transientRate = 0
  private bassRate = 0
  private highRate = 0

  private readonly out: AudioFeatures = {
    energy: 0,
    level: 0,
    bands: { sub: 0, bass: 0, lowMid: 0, mid: 0, high: 0, air: 0 },
    onset: 0,
    bassHit: 0,
    highHit: 0,
    brightness: 0,
    flow: 1,
    splatter: 0,
    geometry: 0,
    bpm: 0,
    beatPhase: 0,
  }

  // Low-band onsets, since kicks drive the tempo.
  private readonly onsetRing = new Float32Array(TEMPO_RING)
  private ringPos = 0
  private ringCount = 0

  private sinceTempo = 0

  private bpm = 0
  private beatPhase = 0

  setSamples(samples: Float32Array, count: number, sampleRate: number) {
    this.samples = samples
    this.sampleCount = count
    this.sampleRate = sampleRate
    this.computeBands()
    this.reset()
  }

  // Call on a seek, or the stale previous spectrum registers as one giant onset.
  reset() {
    this.hasPrev = false
    this.prevMags.fill(0)
    this.bandTrackers.forEach(t => t.reset())
    this.energyTracker.reset()
    this.onsetTracker.reset()
    this.bassHitTracker.reset()
    this.highHitTracker.reset()
    this.transientRate = 0
    this.bassRate = 0
    this.highRate = 0
    this.onsetRing.fill(0)
    this.ringPos = 0
    this.ringCount = 0
    this.sinceTempo = 0
    this.bpm = 0
    this.beatPhase = 0
  }

  private computeBands() {
    const nyquist = this.sampleRate / 2
    for (let i = 0; i < BANDS.length; i++) {
      const lo = Math.max(1, Math.floor((BANDS[i]!.lo / nyquist) * HALF))
      const hi = Math.max(lo + 1, Math.floor((BANDS[i]!.hi / nyquist) * HALF))
      this.bandLo[i] = lo
      this.bandHi[i] = Math.min(HALF, hi)
    }
  }

  // Returns the same object every call, so don't hold it across frames.
  analyze(center: number): AudioFeatures {
    const samples = this.samples
    if (!samples || this.sampleCount === 0)
      return this.out

    const start = center - HALF
    for (let i = 0; i < FFT_SIZE; i++) {
      const s = start + i
      this.frame[i] = (s >= 0 && s < this.sampleCount ? samples[s]! : 0) * this.hann[i]!
    }
    this.fft.magnitudes(this.frame, this.mags)
    return this.analyzeMags(this.mags)
  }

  // For callers that already ran the FFT. `mags` must be HALF long.
  analyzeMags(mags: Float32Array): AudioFeatures {
    const out = this.out
    if (!this.samples || this.sampleCount === 0)
      return out

    // Peak within each band, log-companded.
    let total = 0
    for (let i = 0; i < BANDS.length; i++) {
      let peak = 0
      const hi = this.bandHi[i]!
      for (let b = this.bandLo[i]!; b < hi; b++) {
        const m = mags[b]!
        if (m > peak)
          peak = m
      }

      const v = this.bandTrackers[i]!.push(Math.log10(1 + peak / FFT_SIZE * 64))
      out.bands[BANDS[i]!.key] = v
      total += peak
    }
    out.level = Math.min(1, Math.log10(1 + total / FFT_SIZE) * 1.6)
    out.energy = this.energyTracker.push(out.level)

    // Split low and high so kicks and hats fire independently.
    let flux = 0
    let lowFlux = 0
    let highFlux = 0
    const mid = Math.floor(HALF * 0.18)
    if (this.hasPrev) {
      for (let k = 1; k < HALF; k++) {
        const d = mags[k]! - this.prevMags[k]!
        if (d > 0) {
          flux += d
          if (k < mid)
            lowFlux += d
          else
            highFlux += d
        }
      }
    }
    this.prevMags.set(mags)
    this.hasPrev = true

    const scale = FFT_SIZE
    out.onset = this.onsetTracker.push(flux / scale)
    out.bassHit = this.bassHitTracker.push(lowFlux / scale)
    out.highHit = this.highHitTracker.push(highFlux / scale)

    this.trackTempo(out.bassHit)
    out.bpm = this.bpm
    out.beatPhase = this.beatPhase

    const lowE = out.bands.sub + out.bands.bass + out.bands.lowMid
    const highE = out.bands.mid + out.bands.high + out.bands.air
    out.brightness = highE + lowE > 1e-4 ? highE / (highE + lowE) : 0.5

    this.transientRate += (out.onset - this.transientRate) * 0.04
    this.bassRate += (out.bassHit - this.bassRate) * 0.05
    this.highRate += (out.highHit - this.highRate) * 0.06

    const calm = 1 - Math.min(1, this.transientRate * 2.2)
    let flow = 0.15 + calm * (1 - out.energy * 0.5)
    let splatter = this.bassRate * 2.4 * (0.4 + out.energy)
    let geometry = this.highRate * 2.2 * (0.3 + out.brightness)

    // Additive, so the base formula still drives the mood.
    if (this.bpm > 0) {
      if (this.bpm < 110 && this.bassRate > 0.2)
        splatter += 0.4 * this.bassRate
      if (this.bpm > 140)
        geometry += 0.3 * (0.3 + out.brightness)
    }
    else {
      flow += 0.2
    }

    const sum = flow + splatter + geometry || 1
    out.flow = flow / sum
    out.splatter = splatter / sum
    out.geometry = geometry / sum

    return out
  }

  private trackTempo(lowOnset: number) {
    this.onsetRing[this.ringPos] = lowOnset
    this.ringPos = (this.ringPos + 1) % TEMPO_RING
    if (this.ringCount < TEMPO_RING)
      this.ringCount++

    if (this.bpm > 0) {
      this.beatPhase += (this.bpm / 60) / ONSET_RATE
      if (this.beatPhase >= 1)
        this.beatPhase -= Math.floor(this.beatPhase)
    }
    else {
      this.beatPhase = 0
    }

    // Wait for enough history that the longest lag means something.
    this.sinceTempo++
    if (this.sinceTempo < TEMPO_INTERVAL || this.ringCount < MAX_LAG * 3)
      return

    this.sinceTempo = 0

    // Subtract the mean so a loud DC level doesn't swamp the periodicity.
    const n = this.ringCount
    let mean = 0
    for (let i = 0; i < n; i++)
      mean += this.onsetRing[(this.ringPos + i) % TEMPO_RING]!
    mean /= n

    let bestLag = 0
    let bestScore = 0
    for (let lag = MIN_LAG; lag <= MAX_LAG; lag++) {
      let score = 0
      for (let i = lag; i < n; i++) {
        const a = this.onsetRing[(this.ringPos + i) % TEMPO_RING]! - mean
        const b = this.onsetRing[(this.ringPos + i - lag) % TEMPO_RING]! - mean
        score += a * b
      }

      // Otherwise long lags lose out for having fewer terms.
      score /= (n - lag)
      if (score > bestScore) {
        bestScore = score
        bestLag = lag
      }
    }

    // Leak toward 0 so a beatless passage stops reading as a fixed tempo.
    if (bestLag === 0 || bestScore <= 0) {
      this.bpm *= 0.9
      if (this.bpm < 1)
        this.bpm = 0
      return
    }

    let bpm = (60 * ONSET_RATE) / bestLag

    bpm = this.foldTempo(bpm)

    if (this.bpm === 0)
      this.bpm = bpm
    else
      this.bpm += (bpm - this.bpm) * 0.25
  }

  // Folds into 90-180 by doubling or halving, then prefers the octave nearest
  // the current lock so a track doesn't flip between 75 and 150.
  private foldTempo(bpm: number): number {
    let b = bpm
    while (b < 90)
      b *= 2
    while (b > 180)
      b /= 2

    if (this.bpm > 0) {
      const candidates = [b, b * 2, b / 2]
      let best = b
      let bestGap = Infinity
      for (const c of candidates) {
        if (c < MIN_BPM || c > MAX_BPM)
          continue

        const gap = Math.abs(c - this.bpm)
        if (gap < bestGap) {
          bestGap = gap
          best = c
        }
      }
      b = best
    }
    return b
  }
}
