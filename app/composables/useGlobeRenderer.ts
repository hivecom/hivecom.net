/// <reference types="@webgpu/types" />
// useGlobeRenderer.ts
// Owns the WebGL side of the globe:
//   - Post-processing pipeline (scanline ShaderPass, UnrealBloom, AfterimagePass)
//   - Per-frame animation tick (shader time uniform, hex color refresh)
//   - Arc + ring spawn scheduling
//   - Resize observer
//   - Theme observer (MutationObserver + media query)
//
// Designed to be called once from the component's onMounted. All teardown
// is handled by onBeforeUnmount via the returned `destroy` function.

import type { CountryFeature, CountryPoint, FeatureCollection } from '@/composables/useGlobeData'
import type { GlobePerfParams } from '@/composables/useGlobePerf'
import { onBeforeUnmount } from 'vue'
import scanPassFragSrc from '@/components/Landing/LandingHeroGlobeScanPass.frag.glsl?raw'
import scanPassVertSrc from '@/components/Landing/LandingHeroGlobeScanPass.vert.glsl?raw'
import { useGlobeBase } from '@/composables/useGlobeBase'

import { SCAN_PASS_DEFAULTS, SCAN_PASS_LOW_PERF } from '@/lib/globe/GlobeShaders'
import {
  ATMOSPHERE_COLOR,
  blendHex,
  getArcColor,
  getHexBaseColor,
  getHighlightColor,
  getRingRgb,
  getTextColor,
  isLightTheme,
  parseColor,
} from '@/lib/globe/GlobeTheme'

// ---------------------------------------------------------------------------
// Types
// ------------------------------------------------------------------------
type GlobeInstance = import('globe.gl').GlobeInstance

interface ArcDatum {
  startLat: number
  startLng: number
  endLat: number
  endLng: number
}

interface RingDatum {
  lat: number
  lng: number
}

// ---------------------------------------------------------------------------
// Timing constants
// ------------------------------------------------------------------------
const FLIGHT_TIME = 3200
const ARC_REL_LEN = 0.35
const RING_MAX_R = 24
const RING_PROPAGATION_SPEED = 6
const RING_REPEAT_PERIOD = Infinity
const ARC_INTERVAL = Math.max(600, Math.floor(FLIGHT_TIME / 2))
const HIGHLIGHT_FADE_MS = 2000
const HIGHLIGHT_START_MS = 1200

// ---------------------------------------------------------------------------
// Composable
// ------------------------------------------------------------------------
export function useGlobeRenderer() {
  // Internal mutable state - none of this needs to be reactive.
  let globeInstance: GlobeInstance | null = null

  const base = useGlobeBase()

  let scanlinePass:
    | import('three/examples/jsm/postprocessing/ShaderPass.js').ShaderPass
    | null = null
  let bloomPass:
    | import('three/examples/jsm/postprocessing/UnrealBloomPass.js').UnrealBloomPass
    | null = null
  let afterimagePass:
    | import('three/examples/jsm/postprocessing/AfterimagePass.js').AfterimagePass
    | null = null

  let scanlineStart = 0
  let arcInterval: ReturnType<typeof setInterval> | null = null
  let timeouts: ReturnType<typeof setTimeout>[] = []
  let animationFrame: number | null = null
  let bloomThemeMedia: MediaQueryList | null = null
  let bloomThemeObserver: MutationObserver | null = null

  const highlighted = new Map<string, { started: number, duration: number }>()

  // ---------------------------------------------------------------------------
  // Timer teardown
  // ------------------------------------------------------------------------
  function clearTimers() {
    if (arcInterval != null)
      clearInterval(arcInterval)
    timeouts.forEach(clearTimeout)
    arcInterval = null
    timeouts = []
    if (animationFrame != null)
      cancelAnimationFrame(animationFrame)
    animationFrame = null
  }

  // ---------------------------------------------------------------------------
  // Post-processing resolution sync
  // ------------------------------------------------------------------------
  function updateScanlinePassResolution(width: number, height: number) {
    const w = Math.max(1, width)
    const h = Math.max(1, height)

    if (scanlinePass) {
      const uniforms = scanlinePass.material.uniforms
      const res = uniforms.u_resolution?.value as
        | { set?: (x: number, y: number) => void }
        | undefined
      res?.set?.(w, h)
    }

    const maybeBloom = bloomPass as unknown as {
      setSize?: (w: number, h: number) => void
    } | null
    maybeBloom?.setSize?.(w, h)

    const maybeAfterimage = afterimagePass as unknown as {
      setSize?: (w: number, h: number) => void
    } | null
    maybeAfterimage?.setSize?.(w, h)
  }

  // ---------------------------------------------------------------------------
  // Post-processing setup
  // ------------------------------------------------------------------------
  async function setupPostProcessing(perfParams: GlobePerfParams) {
    if (!import.meta.client || !globeInstance)
      return

    const uniforms = perfParams.scanlineEnabled
      ? SCAN_PASS_DEFAULTS
      : SCAN_PASS_LOW_PERF

    try {
      const composer = globeInstance.postProcessingComposer?.()
      if (composer == null)
        return

      const { ShaderPass } = await import(
        'three/examples/jsm/postprocessing/ShaderPass.js',
      )
      const { Vector2 } = await import('three')

      // Keep OutputPass last if it already exists.
      const composerAny = composer as unknown as {
        passes?: unknown[]
        removePass?: (p: unknown) => void
        addPass?: (p: unknown) => void
      }
      const passesBefore = composerAny.passes ?? []
      const existingOutputPass = passesBefore.find((pass) => {
        if (pass == null || typeof pass !== 'object')
          return false
        return Boolean((pass as { isOutputPass?: boolean }).isOutputPass)
      })
      if (existingOutputPass != null && typeof composerAny.removePass === 'function') {
        try {
          composerAny.removePass(existingOutputPass)
        }
        catch {
          // ignore
        }
      }

      if (perfParams.scanlineEnabled) {
        scanlinePass = new ShaderPass({
          uniforms: {
            tDiffuse: { value: null },
            u_time: { value: 0 },
            u_resolution: { value: new Vector2(1, 1) },
            u_strength: { value: uniforms.strength },
            u_speed: { value: uniforms.speed },
            u_band_width: { value: uniforms.bandWidth },
            u_double_band: { value: uniforms.doubleBand },
            u_ripple_speed: { value: uniforms.rippleSpeed },
            u_ripple_y_freq: { value: uniforms.rippleYFreq },
            u_ripple_x_freq: { value: uniforms.rippleXFreq },
            u_chroma: { value: uniforms.chroma },
          },
          vertexShader: scanPassVertSrc,
          fragmentShader: scanPassFragSrc,
        })
        composer.addPass(scanlinePass)
      }

      if (perfParams.bloomEnabled) {
        try {
          const { UnrealBloomPass } = await import(
            'three/examples/jsm/postprocessing/UnrealBloomPass.js',
          )
          bloomPass = new UnrealBloomPass(
            new Vector2(1, 1),
            perfParams.bloomStrength,
            0.05,
            0.5,
          );
          (bloomPass as unknown as { enabled?: boolean }).enabled
            = !isLightTheme()
          composer.addPass(bloomPass)
        }
        catch {
          bloomPass = null
        }
      }

      if (perfParams.afterimageEnabled) {
        try {
          const { AfterimagePass } = await import(
            'three/examples/jsm/postprocessing/AfterimagePass.js',
          )
          afterimagePass = new AfterimagePass(perfParams.afterimageDamp);
          (afterimagePass as unknown as { enabled?: boolean }).enabled
            = !isLightTheme()
          composer.addPass(afterimagePass)
        }
        catch {
          afterimagePass = null
        }
      }

      // Re-append or create OutputPass at the end.
      if (existingOutputPass != null && typeof composerAny.addPass === 'function') {
        composerAny.addPass(existingOutputPass)
      }
      else {
        const passesAfter = (composer as unknown as { passes?: unknown[] })
          .passes
        const hasOutputPass
          = passesAfter?.some((pass) => {
            if (pass == null || typeof pass !== 'object')
              return false
            const ctor = (pass as { constructor?: { name?: string } })
              .constructor
            return (
              ctor?.name === 'OutputPass'
              || Boolean((pass as { isOutputPass?: boolean }).isOutputPass)
            )
          }) ?? false

        if (!hasOutputPass) {
          try {
            const { OutputPass } = await import(
              'three/examples/jsm/postprocessing/OutputPass.js',
            )
            composer.addPass(new OutputPass())
          }
          catch {
            // OutputPass unavailable - colors may look slightly off but
            // everything else still works.
          }
        }
      }
    }
    catch {
      // Fail silently. The globe still renders without post-processing.
      scanlinePass = null
      bloomPass = null
      afterimagePass = null
    }
  }

  // ---------------------------------------------------------------------------
  // Theme helpers
  // ------------------------------------------------------------------------
  // applyGlobeColor is called after base init to toggle bloom/afterimage
  function applyPostProcessingTheme() {
    const light = isLightTheme()

    const maybeBloom = bloomPass as unknown as { enabled?: boolean } | null
    if (maybeBloom != null)
      maybeBloom.enabled = !light

    const maybeAfterimage = afterimagePass as unknown as {
      enabled?: boolean
    } | null
    if (maybeAfterimage != null)
      maybeAfterimage.enabled = !light
  }

  // ---------------------------------------------------------------------------
  // Arc + ring logic
  // ------------------------------------------------------------------------
  function buildArcScheduler(
    allCentroids: CountryPoint[],
    sourceCentroids: CountryPoint[],
    _maxConcurrentArcs: number,
  ) {
    const arcs: ArcDatum[] = []
    const rings: RingDatum[] = []

    const refreshHexes = () => {
      const data = globeInstance?.hexPolygonsData()
      if (data)
        globeInstance?.hexPolygonsData(data)
    }

    const pushData = () => {
      globeInstance?.arcsData(arcs)
      globeInstance?.ringsData(rings)
    }

    const removeRing = (target: RingDatum) => {
      const idx = rings.indexOf(target)
      if (idx >= 0)
        rings.splice(idx, 1)
    }

    const spawnArc = () => {
      if (allCentroids.length < 2)
        return

      const srcPool
        = sourceCentroids.length > 0 ? sourceCentroids : allCentroids
      const src = srcPool[Math.floor(Math.random() * srcPool.length)]!
      let dst = allCentroids[Math.floor(Math.random() * allCentroids.length)]!
      let guard = 0
      while (
        (dst === src
          || Math.abs(dst.lat - src.lat) + Math.abs(dst.lng - src.lng) < 10)
        && guard < 5
      ) {
        dst = allCentroids[Math.floor(Math.random() * allCentroids.length)]!
        guard++
      }

      if (src == null || dst == null)
        return

      const srcPt = src.points && src.points.length > 0
        ? src.points[Math.floor(Math.random() * src.points.length)]!
        : src
      const dstPt = dst.points && dst.points.length > 0
        ? dst.points[Math.floor(Math.random() * dst.points.length)]!
        : dst

      const arc: ArcDatum = {
        startLat: srcPt.lat,
        startLng: srcPt.lng,
        endLat: dstPt.lat,
        endLng: dstPt.lng,
      }
      const srcRing: RingDatum = { lat: src.lat, lng: src.lng }
      const dstRing: RingDatum = { lat: dst.lat, lng: dst.lng }

      arcs.push(arc)
      rings.push(srcRing)

      if (src.iso != null && src.iso !== '') {
        highlighted.set(src.iso, {
          started: performance.now(),
          duration: HIGHLIGHT_START_MS,
        })
        refreshHexes()
      }

      pushData()

      timeouts.push(
        setTimeout(() => {
          rings.push(dstRing)
          pushData()
          if (dst.iso != null && dst.iso !== '') {
            highlighted.set(dst.iso, {
              started: performance.now(),
              duration: HIGHLIGHT_FADE_MS,
            })
            refreshHexes()
          }
        }, FLIGHT_TIME),
      )

      timeouts.push(
        setTimeout(() => {
          const arcIdx = arcs.indexOf(arc)
          if (arcIdx >= 0)
            arcs.splice(arcIdx, 1)
          pushData()
        }, FLIGHT_TIME * 2),
      )

      timeouts.push(
        setTimeout(
          () => {
            removeRing(srcRing)
            removeRing(dstRing)
            pushData()
          },
          FLIGHT_TIME + FLIGHT_TIME * ARC_REL_LEN,
        ),
      )
    }

    return { spawnArc, arcs, rings, refreshHexes }
  }

  // ---------------------------------------------------------------------------
  // Animation tick
  // ------------------------------------------------------------------------
  function startTick(refreshHexes: () => void) {
    const tick = () => {
      refreshHexes()

      if (scanlinePass) {
        const now = performance.now()
        if (!scanlineStart)
          scanlineStart = now
        const uniforms = scanlinePass.material.uniforms
        if (uniforms.u_time)
          uniforms.u_time.value = (now - scanlineStart) / 1000
      }

      animationFrame = requestAnimationFrame(tick)
    }

    tick()
  }

  // ---------------------------------------------------------------------------
  // Main initialisation
  // ------------------------------------------------------------------------
  async function init(
    container: HTMLDivElement,
    featureCollection: FeatureCollection,
    allCentroids: CountryPoint[],
    sourceCentroids: CountryPoint[],
    maxConcurrentArcs: number,
    perfParams: GlobePerfParams,
    countryUserCounts: Map<string, number> = new Map(),
  ): Promise<GlobeInstance> {
    const startLng = Math.random() * 360 - 180
    const startLat = 10 + Math.random() * 50

    const baseResult = await base.init({
      container,
      featureCollection,
      perfParams,
      autoRotateSpeed: -0.4,
      enableZoom: false,
      pointOfView: { lat: startLat, lng: startLng, altitude: 1.9 },
      onResize: (w, h) => updateScanlinePassResolution(w, h),
    })
    globeInstance = baseResult.globeInstance

    const { spawnArc, refreshHexes } = buildArcScheduler(
      allCentroids,
      sourceCentroids,
      maxConcurrentArcs,
    )

    const maxUserCount = countryUserCounts.size > 0 ? Math.max(1, ...countryUserCounts.values()) : 1

    globeInstance
      .enablePointerInteraction(false)
      .hexPolygonColor((d: unknown) => {
        const feat = d as CountryFeature
        const iso
          = feat.properties.ISO_A2
            ?? feat.id
            ?? feat.properties.ADMIN
            ?? feat.properties.name
        const baseHex = getHexBaseColor()
        if (iso == null || iso === '')
          return baseHex
        const entry = highlighted.get(iso)
        if (entry != null) {
          const elapsed = performance.now() - entry.started
          if (elapsed >= entry.duration) {
            highlighted.delete(iso)
          }
          else {
            return blendHex(getHighlightColor(), baseHex, elapsed / entry.duration)
          }
        }
        // Dim ambient highlight for countries with users (max 25% alpha)
        const userCount = countryUserCounts.get(iso.toUpperCase())
        if (userCount != null && userCount > 0) {
          if (isLightTheme()) {
            const t = (userCount / maxUserCount) * 0.25
            return blendHex(baseHex, getTextColor(), t)
          }
          const alpha = (userCount / maxUserCount) * 0.05
          const [r, g, b] = parseColor(getTextColor())
          return `rgba(${r},${g},${b},${alpha})`
        }
        return baseHex
      })
      .showAtmosphere(false)
      .atmosphereColor(ATMOSPHERE_COLOR)
      .arcsData([])
      .arcColor(() => getArcColor())
      .arcStroke(0.4)
      .arcDashLength(ARC_REL_LEN)
      .arcDashGap(2)
      .arcDashInitialGap(1)
      .arcDashAnimateTime(FLIGHT_TIME)
      .arcsTransitionDuration(0)
      .ringColor(() => (t: number) => {
        const alpha = Math.max(0, 2 - t * 4)
        return `rgba(${getRingRgb()},${alpha})`
      })
      .ringMaxRadius(RING_MAX_R)
      .ringPropagationSpeed(RING_PROPAGATION_SPEED)
      .ringRepeatPeriod(RING_REPEAT_PERIOD)

    await setupPostProcessing(perfParams)
    applyPostProcessingTheme()

    // Re-sync size after post-processing so passes and the globe renderer are
    // initialised at the correct resolution. Without this, the scanline pass
    // uses pre-init dimensions and bleeds until the next resize event.
    const { width, height } = container.getBoundingClientRect()
    if (width > 0 && height > 0) {
      globeInstance.width(width).height(height)
      updateScanlinePassResolution(width, height)
    }

    // Also re-apply bloom/afterimage toggling when theme changes
    bloomThemeMedia = window.matchMedia?.('(prefers-color-scheme: light)') ?? null
    bloomThemeMedia?.addEventListener('change', applyPostProcessingTheme)
    bloomThemeObserver = new MutationObserver(applyPostProcessingTheme)
    bloomThemeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })

    startTick(refreshHexes)

    arcInterval = setInterval(() => {
      if (globeInstance != null) {
        const arcsData = globeInstance.arcsData() as ArcDatum[]
        if (arcsData.length < maxConcurrentArcs)
          spawnArc()
      }
    }, ARC_INTERVAL)

    // Seed initial arcs staggered across the first interval window.
    const initialCount = Math.min(
      maxConcurrentArcs,
      Math.max(sourceCentroids.length, allCentroids.length),
    )
    for (let i = 0; i < initialCount; i++) {
      timeouts.push(setTimeout(spawnArc, i * (ARC_INTERVAL / 2)))
    }

    return globeInstance
  }

  // ---------------------------------------------------------------------------
  // Teardown
  // ------------------------------------------------------------------------
  function destroy() {
    clearTimers()
    bloomThemeMedia?.removeEventListener('change', applyPostProcessingTheme)
    bloomThemeMedia = null
    bloomThemeObserver?.disconnect()
    bloomThemeObserver = null
    base.destroy()

    globeInstance = null
    scanlinePass = null
    bloomPass = null
    afterimagePass = null
    scanlineStart = 0
    highlighted.clear()
  }

  onBeforeUnmount(destroy)

  return { init, destroy }
}
