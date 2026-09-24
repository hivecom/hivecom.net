// Starts from navigator hints, then degrades the tier if sampled frame times
// come in slow. Dev override: ?globe_tier=low|medium|high pins the tier for the
// whole page load and skips the probe.

import { readonly, ref } from 'vue'

export type GlobeQualityTier = 'high' | 'medium' | 'low'

export interface GlobePerfParams {
  maxArcs: number

  /** H3 resolution. Each level down cuts the hex count by ~7x. */
  hexResolution: number

  /** Degrees of curvature per hex face. Higher is cheaper. globe.gl defaults to 5. */
  hexCurvatureResolution: number

  /** Circle segments per dot (hexPolygonUseDots). globe.gl defaults to 12. */
  hexDotResolution: number

  bloomEnabled: boolean

  /** AfterimagePass, the phosphor trails. */
  afterimageEnabled: boolean

  scanlineEnabled: boolean

  /** 0 to 1, higher means longer trails. */
  afterimageDamp: number

  bloomStrength: number

  /** Background shader canvas scale, multiplied into devicePixelRatio times element size. */
  bgResScale: number
}

const PERF_PARAMS: Record<GlobeQualityTier, GlobePerfParams> = {
  high: {
    maxArcs: 5,
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
    maxArcs: 3,
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
    maxArcs: 2,
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
// ------------------------------------------------------------------------
// ms. A median frame time above these drops to the next tier.
const THRESHOLD_HIGH_MS = 20 // ~50 fps
const THRESHOLD_MEDIUM_MS = 33 // ~30 fps

const PROBE_FRAMES = 45

// Fewer logical cores than this starts at medium, catching low-end mobile
// before the first frame.
const LOW_CPU_CORE_THRESHOLD = 4

// ---------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------
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

  const nav = navigator as Navigator & {
    deviceMemory?: number
    hardwareConcurrency?: number
  }

  const cores = nav.hardwareConcurrency ?? 4
  const memoryGb = nav.deviceMemory ?? 4

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
// ------------------------------------------------------------------------
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
// ------------------------------------------------------------------------
export function useGlobePerf() {
  // Lazily detect on first call so SSR never touches window/navigator.
  if (import.meta.client)
    _ensureInitialised()

  // Safe to call from multiple components. Calls while a probe runs are ignored.
  function startProbe() {
    // A dev override pins the tier on purpose, so the probe mustn't degrade it.
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

      // Median, to ignore outlier spikes.
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

      // Never upgrade, only degrade. A device the hints put at 'medium' stays
      // there even if the probe comes back fast, since the probe adds load itself.
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
