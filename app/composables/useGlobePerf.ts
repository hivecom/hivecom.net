// useGlobePerf.ts
// Detects device rendering capability by sampling real frame-times from
// requestAnimationFrame, then exposes a reactive quality tier that other
// globe composables can use to scale their parameters.
//
// Tiers
//   'high'   - no restrictions, full post-processing
//   'medium' - reduced bloom strength, single scan band, fewer arcs
//   'low'    - post-processing disabled, minimum arcs, low hex resolution
//
// Dev override: append ?globe_tier=low (or medium/high) to the URL to force
// a specific tier. The probe is skipped when the override is active so the
// tier stays pinned for the full page load.
//
// Singleton: tier/params/probe state is module-level so multiple callers
// (e.g. LandingHeroGlobe + LandingHeroBackground) share one instance and
// one probe run.

import { readonly, ref } from 'vue'

export type GlobeQualityTier = 'high' | 'medium' | 'low'

export interface GlobePerfParams {
  /** Maximum simultaneous arcs. */
  maxArcs: number
  /**
   * H3 resolution level for hexed polygons. Default is 3.
   * Each level down (~2) cuts hex count by ~7x - big GPU savings.
   */
  hexResolution: number
  /**
   * Angular degrees of curvature resolution per hex polygon face.
   * Higher value = fewer faces = cheaper. Default in globe.gl is 5.
   */
  hexCurvatureResolution: number
  /**
   * Circle segment count for dot representation (hexPolygonUseDots=true).
   * Higher = smoother dots but more geometry. Default in globe.gl is 12.
   */
  hexDotResolution: number
  /** Enable UnrealBloom post-processing pass. */
  bloomEnabled: boolean
  /** Enable AfterimagePass (phosphor trails) post-processing pass. */
  afterimageEnabled: boolean
  /** Enable custom scanline ShaderPass. */
  scanlineEnabled: boolean
  /** AfterimagePass damp value (0–1). Higher = longer trails. */
  afterimageDamp: number
  /** UnrealBloomPass strength. */
  bloomStrength: number
  /**
   * Render resolution scale for the background shader canvas.
   * Applied as a multiplier to devicePixelRatio * element dimensions.
   * Lower = fewer fragment shader invocations per frame.
   */
  bgResScale: number
}

const PERF_PARAMS: Record<GlobeQualityTier, GlobePerfParams> = {
  high: {
    maxArcs: 8,
    hexResolution: 3,
    hexCurvatureResolution: 5,
    hexDotResolution: 12,
    bloomEnabled: true,
    afterimageEnabled: true,
    scanlineEnabled: true,
    afterimageDamp: 0.92,
    bloomStrength: 0.22,
    bgResScale: 0.2,
  },
  medium: {
    maxArcs: 5,
    hexResolution: 3,
    hexCurvatureResolution: 8,
    hexDotResolution: 8,
    bloomEnabled: true,
    afterimageEnabled: false,
    scanlineEnabled: true,
    afterimageDamp: 0.88,
    bloomStrength: 0.14,
    bgResScale: 0.1,
  },
  low: {
    maxArcs: 3,
    hexResolution: 2,
    hexCurvatureResolution: 12,
    hexDotResolution: 6,
    bloomEnabled: false,
    afterimageEnabled: false,
    scanlineEnabled: false,
    afterimageDamp: 0.0,
    bloomStrength: 0.0,
    bgResScale: 0.05,
  },
}

// ---------------------------------------------------------------------------
// Frame-time probe config
// ---------------------------------------------------------------------------

// Frame-time thresholds (ms). If the median frame time during the probe
// window exceeds these values, we drop to the next tier.
const THRESHOLD_HIGH_MS = 20 // ~50 fps
const THRESHOLD_MEDIUM_MS = 33 // ~30 fps

// How many frames to sample before making a decision.
const PROBE_FRAMES = 45

// If the device reports a very low logical CPU count, skip probing and start
// at medium. This catches low-end mobile before we even render a frame.
const LOW_CPU_CORE_THRESHOLD = 4

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_TIERS = new Set<GlobeQualityTier>(['high', 'medium', 'low'])

function readTierOverride(): GlobeQualityTier | null {
  if (typeof window === 'undefined')
    return null
  const raw = new URLSearchParams(window.location.search).get('globe_tier')
  if (raw != null && VALID_TIERS.has(raw as GlobeQualityTier))
    return raw as GlobeQualityTier
  return null
}

function detectInitialTier(): GlobeQualityTier {
  const override = readTierOverride()
  if (override != null)
    return override

  if (typeof window === 'undefined')
    return 'high'

  // Navigator hints - available in most modern browsers.
  const nav = navigator as Navigator & {
    deviceMemory?: number
    hardwareConcurrency?: number
  }

  const cores = nav.hardwareConcurrency ?? 4
  const memoryGb = nav.deviceMemory ?? 4

  // Coarse early-out: very low-end hardware.
  if (cores <= 2 || memoryGb <= 1)
    return 'low'
  if (cores < LOW_CPU_CORE_THRESHOLD || memoryGb <= 2)
    return 'medium'

  return 'high'
}

// ---------------------------------------------------------------------------
// Module-level singleton state
// Shared across all callers so the probe only runs once and all consumers
// react to the same tier changes (e.g. globe + background shader).
// ---------------------------------------------------------------------------

const _tier = ref<GlobeQualityTier>('high') // initialised lazily on first client call
const _params = ref<GlobePerfParams>({ ...PERF_PARAMS.high })
let _initialised = false
let _rafHandle: number | null = null
let _probing = false

function _applyTier(t: GlobeQualityTier) {
  _tier.value = t
  _params.value = { ...PERF_PARAMS[t] }
}

function _ensureInitialised() {
  if (_initialised)
    return
  _initialised = true
  _applyTier(detectInitialTier())
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export function useGlobePerf() {
  // Lazily detect on first call so SSR never touches window/navigator.
  if (import.meta.client)
    _ensureInitialised()

  /**
   * Start the frame-time probe. Collects PROBE_FRAMES samples then adjusts
   * the tier downward if the median frame time is too high.
   *
   * Safe to call from multiple components - only one probe runs at a time,
   * and subsequent calls while probing are silently ignored.
   */
  function startProbe() {
    // Skip the probe entirely when a dev override is active - the tier is
    // pinned intentionally and we don't want the probe to degrade it.
    if (readTierOverride() != null)
      return
    if (_probing || !import.meta.client)
      return
    _probing = true

    const samples: number[] = []
    let lastTs = 0

    const frame = (ts: number) => {
      if (lastTs !== 0)
        samples.push(ts - lastTs)
      lastTs = ts

      if (samples.length < PROBE_FRAMES) {
        _rafHandle = requestAnimationFrame(frame)
        return
      }

      // Done collecting - find the median to ignore outlier spikes.
      const sorted = samples.toSorted((a, b) => a - b)
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0

      _probing = false
      _rafHandle = null

      const current = _tier.value
      if (median > THRESHOLD_MEDIUM_MS && current !== 'low') {
        _applyTier('low')
      }
      else if (median > THRESHOLD_HIGH_MS && current === 'high') {
        _applyTier('medium')
      }
      // Never upgrade - only degrade. A slow device that starts at 'medium'
      // via the static hint stays at 'medium' even if the probe comes back
      // fast, because the probe itself adds load that wasn't there before.
    }

    _rafHandle = requestAnimationFrame(frame)
  }

  function stopProbe() {
    if (_rafHandle !== null) {
      cancelAnimationFrame(_rafHandle)
      _rafHandle = null
    }
    _probing = false
  }

  return {
    tier: readonly(_tier),
    params: readonly(_params),
    startProbe,
    stopProbe,
  }
}
