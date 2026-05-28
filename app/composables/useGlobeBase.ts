/// <reference types="@webgpu/types" />
// useGlobeBase.ts
// Shared globe boilerplate extracted from useGlobeRenderer and AdminGlobe:
//   - GPUShaderStage polyfill
//   - Globe instance + MeshStandardMaterial creation
//   - applyGlobeColor (material color only)
//   - setupThemeWatcher (MutationObserver + matchMedia)
//   - ResizeObserver + window resize listener with debounce
//   - Base hex polygon configuration
//   - Auto-rotate / idle-pause controls
//   - pointOfView
//   - destroy base teardown

import type { CountryFeature, FeatureCollection } from '@/composables/useGlobeData'
import type { GlobePerfParams } from '@/composables/useGlobePerf'
import { onBeforeUnmount } from 'vue'
import {
  BACKGROUND_COLOR,
  getGlobeColor,
  getHexBaseColor,
} from '@/lib/globe/GlobeTheme'

// ---------------------------------------------------------------------------
// Types
// ------------------------------------------------------------------------
type GlobeInstance = import('globe.gl').GlobeInstance

export interface GlobeBaseOptions {
  container: HTMLDivElement
  featureCollection: FeatureCollection
  perfParams: GlobePerfParams
  autoRotateSpeed?: number
  enableZoom?: boolean
  pointOfView?: { lat: number, lng: number, altitude: number }
  /** Called after every resize with the new width/height (e.g. for post-processing passes). */
  onResize?: (width: number, height: number) => void
}

export interface GlobeBaseResult {
  globeInstance: GlobeInstance
  globeMaterial: import('three').MeshStandardMaterial
  /**
   * Re-runs hexPolygonColor with the supplied color function.
   * Pass undefined to reset to the plain base-color function.
   */
  refreshHexColors: (colorFn?: (feat: CountryFeature) => string) => void
  destroy: () => void
}

// ---------------------------------------------------------------------------
// Composable
// ------------------------------------------------------------------------
export function useGlobeBase() {
  let globeInstance: GlobeInstance | null = null
  let globeMaterial: import('three').MeshStandardMaterial | null = null

  let resizeObserver: ResizeObserver | null = null
  let windowResizeHandler: (() => void) | null = null
  let themeObserver: MutationObserver | null = null
  let themeMedia: MediaQueryList | null = null
  let wheelCleanup: (() => void) | null = null

  // ---------------------------------------------------------------------------
  // Theme
  // ------------------------------------------------------------------------
  function applyGlobeColor() {
    if (!globeMaterial)
      return
    globeMaterial.color.set(getGlobeColor())
  }

  function setupThemeWatcher() {
    themeMedia = window.matchMedia?.('(prefers-color-scheme: light)') ?? null
    themeMedia?.addEventListener('change', applyGlobeColor)

    themeObserver = new MutationObserver(applyGlobeColor)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })
  }

  // ---------------------------------------------------------------------------
  // Main initialisation
  // ------------------------------------------------------------------------
  async function init(options: GlobeBaseOptions): Promise<GlobeBaseResult> {
    const {
      container,
      featureCollection,
      perfParams,
      autoRotateSpeed = 0.5,
      enableZoom = true,
      pointOfView,
      onResize,
    } = options

    // Polyfill for Linux/Firefox where GPUShaderStage might be missing.
    if (typeof window !== 'undefined' && window.GPUShaderStage == null) {
      window.GPUShaderStage = { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 }
    }

    async function importWithRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 800): Promise<T> {
      let lastError: unknown
      for (let i = 0; i < retries; i++) {
        try {
          return await fn()
        }
        catch (err) {
          lastError = err
          if (i < retries - 1)
            await new Promise(resolve => setTimeout(resolve, delayMs * (i + 1)))
        }
      }
      throw lastError
    }

    const Globe = (await importWithRetry(async () => import('globe.gl'))).default
    const { MeshStandardMaterial } = await importWithRetry(async () => import('three'))

    globeInstance = new Globe(container)
    globeMaterial = new MeshStandardMaterial({
      color: getGlobeColor(),
      roughness: 1,
      metalness: 0,
    })

    // -------------------------------------------------------------------------
    // Resize handling
    // ----------------------------------------------------------------------
    const setSize = () => {
      const { width, height } = container.getBoundingClientRect()
      if (width === 0 || height === 0)
        return
      globeInstance?.width(width).height(height)
      onResize?.(width, height)
    }
    setSize()

    let resizeDebounce: ReturnType<typeof setTimeout> | null = null
    const scheduleResize = () => {
      if (resizeDebounce != null)
        clearTimeout(resizeDebounce)
      resizeDebounce = setTimeout(() => {
        setSize()
        resizeDebounce = null
      }, 150)
    }

    windowResizeHandler = scheduleResize
    window.addEventListener('resize', scheduleResize)

    resizeObserver = new ResizeObserver(scheduleResize)
    resizeObserver.observe(container)

    // -------------------------------------------------------------------------
    // hex refresh helper
    // ----------------------------------------------------------------------
    const refreshHexColors = (colorFn?: (feat: CountryFeature) => string) => {
      if (colorFn) {
        globeInstance?.hexPolygonColor((d: unknown) => colorFn(d as CountryFeature))
      }
      else {
        globeInstance?.hexPolygonColor(() => getHexBaseColor())
      }
    }

    // -------------------------------------------------------------------------
    // Base globe configuration
    // ----------------------------------------------------------------------
    globeInstance
      .globeMaterial(globeMaterial)
      .hexPolygonsData(featureCollection.features)
      .hexPolygonResolution(perfParams.hexResolution)
      .hexPolygonCurvatureResolution(perfParams.hexCurvatureResolution)
      .hexPolygonMargin(0.3)
      .hexPolygonUseDots(true)
      .hexPolygonDotResolution(perfParams.hexDotResolution)
      .hexPolygonColor(() => getHexBaseColor())
      .backgroundColor(BACKGROUND_COLOR)
      .showAtmosphere(false)

    setupThemeWatcher()
    applyGlobeColor()

    globeInstance.controls().autoRotate = true
    globeInstance.controls().autoRotateSpeed = autoRotateSpeed
    // Disable built-in zoom - OrbitControls dolly is instant with no easing path.
    // We drive zoom ourselves via a smooth rAF lerp on pointOfView altitude.
    globeInstance.controls().enableZoom = false

    if (pointOfView) {
      globeInstance.pointOfView(pointOfView, 0)
    }

    // -------------------------------------------------------------------------
    // Smooth zoom via wheel interception
    // ----------------------------------------------------------------------
    if (enableZoom) {
      const MIN_ALT = 0.15
      const MAX_ALT = 8.0
      const ZOOM_SENSITIVITY = 0.0018
      const LERP_FACTOR = 0.1

      let targetAlt = globeInstance.pointOfView().altitude
      let rafId: number | null = null

      const animateZoom = () => {
        if (!globeInstance)
          return
        const current = globeInstance.pointOfView().altitude
        const delta = targetAlt - current
        if (Math.abs(delta) < 0.0001) {
          rafId = null
          return
        }
        const next = current + delta * LERP_FACTOR
        const pov = globeInstance.pointOfView()
        globeInstance.pointOfView({ lat: pov.lat, lng: pov.lng, altitude: next }, 0)
        rafId = requestAnimationFrame(animateZoom)
      }

      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const current = globeInstance?.pointOfView().altitude ?? targetAlt
        // normalise deltaY across deltaMode (DOM_DELTA_LINE, DOM_DELTA_PAGE)
        let dy = e.deltaY
        if (e.deltaMode === 1)
          dy *= 24
        else if (e.deltaMode === 2)
          dy *= 400
        targetAlt = Math.min(MAX_ALT, Math.max(MIN_ALT, current + dy * ZOOM_SENSITIVITY * current))
        rafId ??= requestAnimationFrame(animateZoom)
      }

      container.addEventListener('wheel', onWheel, { passive: false, capture: true })
      wheelCleanup = () => container.removeEventListener('wheel', onWheel, { capture: true })
    }

    // -------------------------------------------------------------------------
    // Teardown
    // ----------------------------------------------------------------------
    const destroy = () => {
      resizeObserver?.disconnect()
      resizeObserver = null

      if (windowResizeHandler) {
        window.removeEventListener('resize', windowResizeHandler)
        windowResizeHandler = null
      }

      themeMedia?.removeEventListener('change', applyGlobeColor)
      themeMedia = null
      themeObserver?.disconnect()
      themeObserver = null

      wheelCleanup?.()
      wheelCleanup = null

      globeInstance?.pauseAnimation?.()
      globeInstance = null
      globeMaterial = null
    }

    return {
      globeInstance,
      globeMaterial,
      refreshHexColors,
      destroy,
    }
  }

  function destroy() {
    resizeObserver?.disconnect()
    resizeObserver = null

    if (windowResizeHandler) {
      window.removeEventListener('resize', windowResizeHandler)
      windowResizeHandler = null
    }

    themeMedia?.removeEventListener('change', applyGlobeColor)
    themeMedia = null
    themeObserver?.disconnect()
    themeObserver = null

    globeInstance?.pauseAnimation?.()
    globeInstance = null
    globeMaterial = null
  }

  onBeforeUnmount(destroy)

  return { init, destroy }
}
