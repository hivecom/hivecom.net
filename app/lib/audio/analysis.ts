// Shared per-frame audio analysis for the fullscreen visualizers. Both reactive
// panels (the smoke field and the spectrum bars) used to decode the same track
// and then, every frame, window their own FFTs at the same playhead: the smoke
// ran one 4096, the spectrum ran an 8192 and a 16384, so ~3 transforms a frame
// on identical PCM. They also each extrapolated the playhead separately, which
// could drift a sample or two between them.
//
// This collapses that into one provider, keyed by src the same way decodeAudio
// caches decoded buffers. The first panel to subscribe spins up one rAF loop
// that extrapolates the playhead once, computes each requested FFT size once,
// and runs the smoke features off the 4096 mags it already has. Every subscriber
// gets the same frame, so adding another reactive element costs no extra
// transform. The last unsubscribe parks the loop.
//
// It reads playback state straight off useAudioPlayer, so panels pass nothing
// but their draw callback. Nothing here touches the DOM or WebGL.

import type { AudioFeatures } from '@/lib/audio/features'
import { useAudioPlayer } from '@/composables/useAudioPlayer'
import { decodeAudio } from '@/lib/audio/decode'
import { FeatureAnalyzer, IDLE_FEATURES } from '@/lib/audio/features'
import { hannWindow, RealFFT } from '@/lib/audio/fft'

// The FFT window sizes the panels ask for. 4096 feeds the smoke features (same
// window the old FeatureAnalyzer ran internally); 8192 and 16384 feed the
// spectrum's snappy and bass bars.
export type MagSize = 4096 | 8192 | 16384

export interface AnalysisFrame {
  // The rAF timestamp for this frame (ms), for dt and the engine's time clock.
  now: number
  // Decoded sample rate, so a panel can map frequencies to bins. 0 until decode
  // finishes.
  sampleRate: number
  // Extrapolated 0..1 playhead, computed once for every panel this frame.
  playhead: number
  // Whether the engine is playing right now. Panels that idle on pause read it.
  playing: boolean
  // Whether the engine is buffering/seeking. The spectrum idles its bars on it.
  loading: boolean
  // Smoke features, folded from the 4096 mags. Same object each frame, don't
  // hold it across frames.
  features: AudioFeatures
  // Magnitudes for a window size, computed once per frame and memoized on the
  // frame's integer sample index. The same Float32Array is handed to every
  // subscriber, so don't mutate it.
  mags: (size: MagSize) => Float32Array
}

export interface SharedAnalysis {
  // Subscribe a per-frame callback. Returns an unsubscribe. The provider runs a
  // single rAF while it has subscribers and playback is live (plus a coast
  // window so the smoke dissolves); the last unsubscribe parks it.
  subscribe: (fn: (frame: AnalysisFrame) => void) => () => void
  // Force at least one more frame even while paused and past the coast window.
  // Panels call this on resize / theme flip so they redraw while the loop would
  // otherwise be parked, the way each used to nudge its own loop.
  requestFrame: () => void
}

// Keep rendering for a moment after playback stops so the smoke dissolves
// instead of freezing mid-wisp, then park the loop. Same window the smoke panel
// used to hold inline.
const COAST_MS = 2600

// Per-size FFT scratch: a hann window, a transform, a frame buffer, and the
// magnitude output. Built once per size the panels actually ask for.
class SizedFft {
  private readonly hann: Float32Array
  private readonly fft: RealFFT
  private readonly frame: Float32Array
  readonly mags: Float32Array
  // The integer sample index the cached mags were computed at, or -1 when stale.
  computedAt = -1

  constructor(readonly size: number) {
    this.hann = hannWindow(size)
    this.fft = new RealFFT(size)
    this.frame = new Float32Array(size)
    this.mags = new Float32Array(size >> 1)
  }

  // Window `samples` centered on `center` and transform, writing into `mags`.
  // Same window-and-transform the panels ran inline.
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

// One provider per src, so both panels on the same track share the decode, the
// analyzer, and the single rAF loop. Mirrors the decodeAudio cache shape.
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
  private coastUntil = 0
  // Set by requestFrame so the next tick runs once even when parked, then clears.
  private nudge = false

  // Playhead extrapolation basis, the same anchor-and-extrapolate math
  // usePlayhead runs: remember the progress value and when it landed, then
  // advance it by wall-clock elapsed / duration.
  private basisProgress = 0
  private basisAt = 0
  private lastProgress = Number.NaN

  // Last playhead in seconds, so a big jump reads as a seek and resets the
  // analyzer instead of registering as one giant fake onset.
  private lastTrackedSec = 0

  // The integer sample index the current frame's mags/features were computed at.
  private frameCenter = -1

  // Previous frame's playing flag, so a pause->play resume drops the analyzer's
  // flux history the way the smoke panel did on its play watch (the gap across a
  // pause would otherwise read as one fake onset on the first frame back).
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
      // A panel may have subscribed while we decoded; kick the loop if so.
      if (this.subscribers.size > 0)
        this.startLoop()
    }
    catch {
      // No audio (e.g. cross-origin without CORS). Panels just idle.
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

  // Last subscriber gone: park the loop and drop the provider so its decoded PCM
  // (tens of MB on a long track) can be collected instead of lingering for every
  // track played this session. The next request for this src re-decodes, which
  // is cheap while decodeAudio still holds the track.
  private dispose() {
    this.stopLoop()
    this.samples = null
    if (providers.get(this.src) === this)
      providers.delete(this.src)
  }

  requestFrame() {
    this.nudge = true
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

  // Extrapolated 0..1 playhead at `now`, re-anchoring whenever a fresh progress
  // value has arrived from the engine. duration 0 holds the basis.
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

  // Compute (once, memoized on the frame's sample index) the mags for a size.
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

    // Resume from pause: drop stale flux history so the first frame back doesn't
    // fire a fake onset off the gap.
    if (playing && !this.wasPlaying)
      this.analyzer.reset()
    this.wasPlaying = playing

    // Extrapolate the playhead once for every panel this frame.
    const head = this.playheadAt(now)
    this.frameCenter = this.ready && this.sampleCount > 0 ? Math.floor(head * this.sampleCount) : -1

    // While playing, run the smoke features off the 4096 mags (computing them if
    // a subscriber hasn't already asked). A backward or large jump in the
    // playhead is a seek: drop the flux history so it doesn't read as one giant
    // fake onset. When not playing, coast on the idle (fading) feature set.
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

    // This frame satisfies any pending nudge.
    this.nudge = false

    for (const fn of this.subscribers)
      fn(frame)

    // Keep looping as long as a panel is subscribed, even while paused, so the field
    // stays alive (the dust idles, the smoke keeps drifting) instead of freezing a
    // few seconds after a pause. The coast deadline is kept refreshed for reference,
    // but the loop now only parks when the last panel unsubscribes (the lightbox
    // closed), which drops the provider.
    if (playing)
      this.coastUntil = now + COAST_MS
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
