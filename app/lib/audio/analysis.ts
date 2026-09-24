// Shared per-frame analysis for the fullscreen visualizers, one provider per
// src. A single rAF loop extrapolates the playhead once and computes each
// requested FFT size once, so every subscriber sees the same frame and an extra
// panel costs no extra transform. No DOM or WebGL here.

import type { AudioFeatures } from '@/lib/audio/features'
import { useAudioPlayer } from '@/composables/useAudioPlayer'
import { decodeAudio } from '@/lib/audio/decode'
import { FeatureAnalyzer, IDLE_FEATURES } from '@/lib/audio/features'
import { hannWindow, RealFFT } from '@/lib/audio/fft'

// 4096 feeds the smoke features, 8192 and 16384 the spectrum's snappy and bass bars.
export type MagSize = 4096 | 8192 | 16384

export interface AnalysisFrame {
  // rAF timestamp in ms.
  now: number

  // 0 until decode finishes.
  sampleRate: number

  // Extrapolated, 0..1.
  playhead: number

  playing: boolean

  // Buffering or seeking.
  loading: boolean

  // Same object each frame, so don't hold it across frames.
  features: AudioFeatures

  // Every subscriber gets the same Float32Array, so don't mutate it.
  mags: (size: MagSize) => Float32Array
}

export interface SharedAnalysis {
  // The loop keeps running while anything is subscribed. The last unsubscribe
  // parks it and drops the provider.
  subscribe: (fn: (frame: AnalysisFrame) => void) => () => void

  // For redraws on resize or a theme flip.
  requestFrame: () => void
}

class SizedFft {
  private readonly hann: Float32Array
  private readonly fft: RealFFT
  private readonly frame: Float32Array
  readonly mags: Float32Array

  // Sample index the cached mags were computed at, -1 when stale.
  computedAt = -1

  constructor(readonly size: number) {
    this.hann = hannWindow(size)
    this.fft = new RealFFT(size)
    this.frame = new Float32Array(size)
    this.mags = new Float32Array(size >> 1)
  }

  compute(samples: Float32Array, sampleCount: number, center: number) {
    const half = this.size >> 1
    const start = center - half
    for (let i = 0; i < this.size; i++) {
      const s = start + i
      this.frame[i] = (s >= 0 && s < sampleCount ? samples[s]! : 0) * this.hann[i]!
    }
    this.fft.magnitudes(this.frame, this.mags)
    this.computedAt = center
  }
}

const providers = new Map<string, Provider>()

class Provider implements SharedAnalysis {
  private readonly subscribers = new Set<(frame: AnalysisFrame) => void>()
  private readonly analyzer = new FeatureAnalyzer()
  private readonly ffts = new Map<MagSize, SizedFft>()
  private readonly player = useAudioPlayer()

  private samples: Float32Array | null = null
  private sampleCount = 0
  private sampleRate = 0
  private ready = false

  private rafId: number | null = null

  // Same anchor-and-extrapolate math as usePlayhead.
  private basisProgress = 0
  private basisAt = 0
  private lastProgress = Number.NaN

  // A big jump reads as a seek and resets the analyzer.
  private lastTrackedSec = 0

  private frameCenter = -1

  private wasPlaying = false

  constructor(private readonly src: string) {
    void this.load()
  }

  private async load() {
    try {
      const buffer = await decodeAudio(this.src)
      this.samples = buffer.getChannelData(0)
      this.sampleCount = buffer.length
      this.sampleRate = buffer.sampleRate
      this.analyzer.setSamples(this.samples, this.sampleCount, buffer.sampleRate)
      this.ready = true

      // A panel may have subscribed during the decode.
      if (this.subscribers.size > 0)
        this.startLoop()
    }
    catch {
      // e.g. cross-origin without CORS. Panels just idle.
      this.samples = null
    }
  }

  subscribe(fn: (frame: AnalysisFrame) => void): () => void {
    this.subscribers.add(fn)
    this.startLoop()
    return () => {
      this.subscribers.delete(fn)
      if (this.subscribers.size === 0)
        this.dispose()
    }
  }

  // Drops the provider so its decoded PCM (tens of MB on a long track) can be
  // collected instead of lingering for every track played this session.
  private dispose() {
    this.stopLoop()
    this.samples = null
    if (providers.get(this.src) === this)
      providers.delete(this.src)
  }

  requestFrame() {
    this.startLoop()
  }

  private startLoop() {
    if (this.rafId == null && import.meta.client)
      this.rafId = requestAnimationFrame(this.tick)
  }

  private stopLoop() {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  // Re-anchors whenever a fresh progress value arrives from the engine.
  private playheadAt(now: number): number {
    const duration = this.player.duration.value
    const progress = duration > 0 ? this.player.currentTime.value / duration : 0
    if (progress !== this.lastProgress) {
      this.lastProgress = progress
      this.basisProgress = progress
      this.basisAt = now
    }
    const elapsed = duration > 0 ? (now - this.basisAt) / 1000 / duration : 0
    return Math.max(0, Math.min(1, this.basisProgress + elapsed))
  }

  // Memoized on the frame's sample index.
  private magsFor = (size: MagSize): Float32Array => {
    let sized = this.ffts.get(size)
    if (!sized) {
      sized = new SizedFft(size)
      this.ffts.set(size, sized)
    }
    if (this.samples && sized.computedAt !== this.frameCenter)
      sized.compute(this.samples, this.sampleCount, this.frameCenter)
    return sized.mags
  }

  private tick = (now: number) => {
    const playing = this.player.playing.value
    const loading = this.player.loading.value
    const duration = this.player.duration.value

    // Otherwise the gap across a pause reads as one fake onset on resume.
    if (playing && !this.wasPlaying)
      this.analyzer.reset()
    this.wasPlaying = playing

    const head = this.playheadAt(now)
    this.frameCenter = this.ready && this.sampleCount > 0 ? Math.floor(head * this.sampleCount) : -1

    let features = IDLE_FEATURES
    if (playing && this.ready && this.sampleCount > 0 && duration > 0) {
      const sec = head * duration
      if (Math.abs(sec - this.lastTrackedSec) > 0.5)
        this.analyzer.reset()
      this.lastTrackedSec = sec
      features = this.analyzer.analyzeMags(this.magsFor(4096))
    }

    const frame: AnalysisFrame = {
      now,
      sampleRate: this.sampleRate,
      playhead: head,
      playing,
      loading,
      features,
      mags: this.magsFor,
    }

    for (const fn of this.subscribers)
      fn(frame)

    const keepGoing = this.subscribers.size > 0
    if (keepGoing)
      this.rafId = requestAnimationFrame(this.tick)
    else
      this.rafId = null
  }
}

export function getSharedAnalysis(src: string): SharedAnalysis {
  let provider = providers.get(src)
  if (!provider) {
    provider = new Provider(src)
    providers.set(src, provider)
  }
  return provider
}
