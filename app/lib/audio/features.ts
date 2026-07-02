// Per-playhead audio feature extraction for the fullscreen smoke visualizer.
// Same idea as AudioSpectrum: decode the track once, then each frame window a
// single FFT at the playhead instead of analyzing the whole file up front. Here
// we don't paint bars, we boil the spectrum down to a handful of features the
// smoke engine reacts to: band energies, per-band transients (onsets), spectral
// brightness, and three smoothed "mood" weights the visual style morphs between.
//
// Nothing here touches the DOM or WebGL, so it stays a plain, testable module.

import { hannWindow, RealFFT } from '@/lib/audio/fft'

// One window feeds every feature. 4096 at 44.1k is ~93ms, fine for band energy
// and short enough that frame-to-frame flux still catches kicks and hats.
const FFT_SIZE = 4096
const HALF = FFT_SIZE / 2

// Tempo tracking. The analyzer runs at the visual frame rate (~60fps), so the
// onset envelope is sampled at ~60Hz. A ring of ~6s (384 samples) is plenty of
// history to autocorrelate. BPM = 60 * onsetRate / lag, so 60-180 BPM at 60Hz
// is lag 20-60. We assume 60Hz for the BPM number; a little frame-rate wobble
// only nudges the estimate, and the half/double resolve plus smoothing absorb
// it. Autocorrelate every ~24 frames (~400ms) to keep it cheap.
const TEMPO_RING = 384
const ONSET_RATE = 60
const MIN_BPM = 60
const MAX_BPM = 180
const MIN_LAG = Math.floor((60 * ONSET_RATE) / MAX_BPM)
const MAX_LAG = Math.ceil((60 * ONSET_RATE) / MIN_BPM)
const TEMPO_INTERVAL = 24

// The bands we pool the spectrum into, in Hz. Roughly: kick/sub, bass, body,
// presence, air. The engine reads these by name.
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
  // Smoothed overall loudness, 0..1. Drives turbulence and brightness.
  energy: number
  // Instantaneous loudness this frame, 0..1.
  level: number
  // Per-band energy, each 0..1 after adaptive normalization.
  bands: Record<BandKey, number>
  // Overall transient strength this frame, 0..1 (spectral flux).
  onset: number
  // Transient strength in the low end (kick / DnB blast), 0..1.
  bassHit: number
  // Transient strength up top (snare / hat / click), 0..1.
  highHit: number
  // Spectral tilt: 0 dark/bass-heavy, 1 bright/airy.
  brightness: number
  // Mood weights, each 0..1, roughly summing to 1. The engine cross-fades style
  // between them: slow lines, splotchy blasts, sharp geometry.
  flow: number
  splatter: number
  geometry: number
  // Estimated tempo in BPM, smoothed, 0 until we're confident. Derived from the
  // low-band onset envelope by autocorrelation.
  bpm: number
  // Phase within the current beat, 0..1, advancing with the estimated tempo.
  // Stays 0 while bpm is 0. A visual can pulse on it instead of raw flux.
  beatPhase: number
}

// The calm/default feature set a consumer feeds the engine when nothing is
// playing: everything zeroed, brightness neutral, no mood weight. Note this is
// NOT the analyzer's internal `out` default (which seeds flow at 1 so a fresh
// analyzer reads as "calm lines"); here every mood weight is 0 so the field just
// settles and fades. Exported so a viz component can import it instead of
// re-declaring the shape inline.
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

// A value that snaps up fast and falls slow, used to turn raw flux into a 0..1
// hit with a natural attack/decay. Also tracks an adaptive ceiling so loud and
// quiet tracks both map into range.
class Tracker {
  value = 0
  private ceiling = 1e-3
  constructor(private readonly attack: number, private readonly decay: number) {}

  // Feed a raw magnitude; returns the normalized, smoothed 0..1 value.
  push(raw: number): number {
    // Adaptive ceiling: rises instantly to new peaks, leaks down slowly so a
    // track that gets quieter re-sensitizes instead of staying pinned low.
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

  // Bin ranges per band, filled once the sample rate is known.
  private readonly bandLo = new Int32Array(BANDS.length)
  private readonly bandHi = new Int32Array(BANDS.length)

  private samples: Float32Array | null = null
  private sampleCount = 0
  private sampleRate = 44100

  // Smoothers and onset trackers.
  private readonly bandTrackers = BANDS.map(() => new Tracker(0.6, 0.12))
  private readonly energyTracker = new Tracker(0.5, 0.05)
  private readonly onsetTracker = new Tracker(0.8, 0.18)
  private readonly bassHitTracker = new Tracker(0.9, 0.4)
  private readonly highHitTracker = new Tracker(0.85, 0.2)

  // Slow-moving stats the mood is derived from, so style doesn't flicker frame
  // to frame. transientRate is a leaky count of recent onsets.
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

  // Tempo tracking. A ring of the recent low-band onset envelope (kick/snare
  // drive tempo), autocorrelated every so often to find the beat period.
  private readonly onsetRing = new Float32Array(TEMPO_RING)
  private ringPos = 0
  private ringCount = 0
  // Frames since the last autocorrelation, so we run it every ~few hundred ms
  // instead of every frame.
  private sinceTempo = 0
  // Smoothed BPM estimate and the phase within the current beat.
  private bpm = 0
  private beatPhase = 0

  setSamples(samples: Float32Array, count: number, sampleRate: number) {
    this.samples = samples
    this.sampleCount = count
    this.sampleRate = sampleRate
    this.computeBands()
    this.reset()
  }

  // Clear running history. Call on a seek so a stale previous spectrum doesn't
  // register as one giant fake onset.
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

  // Window the frame centered on `center` (a sample index), transform it, and
  // fold the spectrum into the feature set. Returns a reference to the same
  // object each call, so don't hold it across frames. Thin wrapper: the shared
  // analysis provider skips this and calls analyzeMags with mags it already has.
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

  // Fold an already-computed 4096 magnitude array into the feature set. Same
  // work analyze does after the transform, split out so the shared provider can
  // hand in the mags it computed once for every panel instead of each analyzer
  // running its own FFT. `mags` must be HALF long (a 4096 window's lower half).
  analyzeMags(mags: Float32Array): AudioFeatures {
    const out = this.out
    if (!this.samples || this.sampleCount === 0)
      return out

    // Per-band energy (peak within the band, log-companded) and total energy.
    let total = 0
    for (let i = 0; i < BANDS.length; i++) {
      let peak = 0
      const hi = this.bandHi[i]!
      for (let b = this.bandLo[i]!; b < hi; b++) {
        const m = mags[b]!
        if (m > peak)
          peak = m
      }
      // Compand into a friendlier range; the tracker handles final scaling.
      const v = this.bandTrackers[i]!.push(Math.log10(1 + peak / FFT_SIZE * 64))
      out.bands[BANDS[i]!.key] = v
      total += peak
    }
    out.level = Math.min(1, Math.log10(1 + total / FFT_SIZE) * 1.6)
    out.energy = this.energyTracker.push(out.level)

    // Spectral flux: sum of positive bin-to-bin increases since last frame.
    // Split into a low and high half so kicks and hats can fire independently.
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

    // Tempo: push this frame's low onset into the ring and, every so often,
    // autocorrelate for the beat period. Then advance the beat phase.
    this.trackTempo(out.bassHit)
    out.bpm = this.bpm
    out.beatPhase = this.beatPhase

    // Brightness: how much of the energy sits up high. Bass-heavy -> 0, airy -> 1.
    const lowE = out.bands.sub + out.bands.bass + out.bands.lowMid
    const highE = out.bands.mid + out.bands.high + out.bands.air
    out.brightness = highE + lowE > 1e-4 ? highE / (highE + lowE) : 0.5

    // Leaky rates of recent activity, the mood reads from these so it glides.
    this.transientRate += (out.onset - this.transientRate) * 0.04
    this.bassRate += (out.bassHit - this.bassRate) * 0.05
    this.highRate += (out.highHit - this.highRate) * 0.06

    // Mood: three raw weights, normalized. Flow wins when it's calm and sparse;
    // splatter when the low end is pumping; geometry when the top end is busy
    // and bright.
    const calm = 1 - Math.min(1, this.transientRate * 2.2)
    let flow = 0.15 + calm * (1 - out.energy * 0.5)
    let splatter = this.bassRate * 2.4 * (0.4 + out.energy)
    let geometry = this.highRate * 2.2 * (0.3 + out.brightness)

    // Tempo sharpens the mood, additive to the weights above so the base formula
    // still drives it. A confident slow beat with strong low onsets leans
    // splatter; nothing to lock onto leans flow; a fast beat leans geometry.
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

  // Feed one low-onset sample into the tempo tracker: ring it, re-estimate the
  // BPM every so often by autocorrelation, and advance the beat phase.
  private trackTempo(lowOnset: number) {
    this.onsetRing[this.ringPos] = lowOnset
    this.ringPos = (this.ringPos + 1) % TEMPO_RING
    if (this.ringCount < TEMPO_RING)
      this.ringCount++

    // Advance the phase with the current estimate. One beat spans ONSET_RATE /
    // (bpm / 60) frames, so phase steps by (bpm / 60) / ONSET_RATE each frame.
    if (this.bpm > 0) {
      this.beatPhase += (this.bpm / 60) / ONSET_RATE
      if (this.beatPhase >= 1)
        this.beatPhase -= Math.floor(this.beatPhase)
    }
    else {
      this.beatPhase = 0
    }

    // Only re-estimate every TEMPO_INTERVAL frames, and only once we have enough
    // history for the longest lag we test to be meaningful.
    this.sinceTempo++
    if (this.sinceTempo < TEMPO_INTERVAL || this.ringCount < MAX_LAG * 3)
      return
    this.sinceTempo = 0

    // Autocorrelate the buffered envelope over the candidate lag range. Read the
    // ring oldest-first into linear order so lag offsets are contiguous. Subtract
    // the mean first so a loud DC level doesn't swamp the periodicity.
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
      // Normalize by the overlap so long lags aren't penalized for fewer terms.
      score /= (n - lag)
      if (score > bestScore) {
        bestScore = score
        bestLag = lag
      }
    }

    // No real periodicity: let the estimate leak back toward 0 so a beatless
    // passage stops reading as a fixed tempo.
    if (bestLag === 0 || bestScore <= 0) {
      this.bpm *= 0.9
      if (this.bpm < 1)
        this.bpm = 0
      return
    }

    let bpm = (60 * ONSET_RATE) / bestLag
    // Resolve half/double-time toward the range most tracks sit in, and prefer
    // continuity with the last estimate so it locks instead of octave-jumping.
    bpm = this.foldTempo(bpm)

    // Smooth so it settles rather than jitters frame to frame.
    if (this.bpm === 0)
      this.bpm = bpm
    else
      this.bpm += (bpm - this.bpm) * 0.25
  }

  // Fold a raw BPM into the musical range by doubling/halving, biased toward
  // 90-150 and toward whatever we last locked onto.
  private foldTempo(bpm: number): number {
    let b = bpm
    while (b < 90)
      b *= 2
    while (b > 180)
      b /= 2
    // If we already have a lock, check the octave neighbours and keep whichever
    // lands closest to it, so a track doesn't flip between 75 and 150.
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
