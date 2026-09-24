/// <reference types="@webgpu/types" />

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
  onResize?: (width: number, height: number) => void
}

export interface GlobeBaseResult {
  globeInstance: GlobeInstance
  globeMaterial: import('three').MeshStandardMaterial

  /** undefined resets to the base color. */
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
  // Incremental hex feed
  // ------------------------------------------------------------------------
  // The hex layer tessellates and merges geometry synchronously in its digest.
  // Setting every country at once blocks the main thread for hundreds of ms, so
  // features stream in batches sized to a per-frame time budget.
  const HEX_FRAME_BUDGET_MS = 14
  const HEX_BATCH_MIN = 1
  const HEX_BATCH_MAX = 40
  const HEX_BATCH_INITIAL = 6

  async function nextFrame(): Promise<void> {
    return new Promise(resolve => requestAnimationFrame(() => resolve()))
  }

  async function feedHexFeatures(features: CountryFeature[]) {
    const fed: CountryFeature[] = []
    let batchSize = HEX_BATCH_INITIAL
    let i = 0

    while (i < features.length) {
      // Destroyed mid-feed, e.g. by a route change.
      if (globeInstance == null)
        return

      for (let n = 0; n < batchSize && i < features.length; n++) {
        const feat = features[i++]
        if (feat != null)
          fed.push(feat)
      }
      globeInstance.hexPolygonsData(fed)

      // The digest runs on a 1ms debounce timer, so awaiting the next frame
      // both lets it run and tells us what the batch cost. Scale the next
      // batch toward the frame budget: cheap countries pack together, big
      // ones (Russia, Canada) get a frame to themselves.
      const start = performance.now()
      await nextFrame()
      const frameMs = performance.now() - start
      if (frameMs > 0) {
        const scaled = Math.round(batchSize * (HEX_FRAME_BUDGET_MS / frameMs))
        batchSize = Math.min(HEX_BATCH_MAX, Math.max(HEX_BATCH_MIN, scaled))
      }
    }
  }

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

    // 'style' catches a custom colour theme: applyTheme sets the tokens inline
    // on the root without touching class or data-theme.
    themeObserver = new MutationObserver(applyGlobeColor)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style'],
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

    // three-render-objects renders at min(devicePixelRatio, 2) and every
    // post-processing pass pays for it. At 1.5 a 2x display does less than half
    // the fragment work, and the dotted globe doesn't show the difference.
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)
    globeInstance.renderer()?.setPixelRatio(pixelRatio)
    globeInstance.postProcessingComposer()?.setPixelRatio(pixelRatio)

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
      .hexPolygonsData([])
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

    // OrbitControls dolly is instant with no easing, so zoom is our own rAF lerp
    // on the pointOfView altitude.
    globeInstance.controls().enableZoom = false

    // OrbitControls keeps a non-passive wheel listener even with zoom off, so
    // every wheel event over the canvas waits on the main thread before the page
    // can scroll. With the globe rendering every frame, scrolling goes
    // unresponsive. Our own listeners handle zoom, so remove it.
    const rawControls = globeInstance.controls() as unknown as {
      domElement?: HTMLElement | null
      _onMouseWheel?: (event: WheelEvent) => void
    }
    if (rawControls.domElement != null && typeof rawControls._onMouseWheel === 'function')
      rawControls.domElement.removeEventListener('wheel', rawControls._onMouseWheel)

    // OrbitControls also sets touch-action: none on the canvas, which turns a
    // decorative full-bleed globe into a touch scroll trap. When zoom is off,
    // let vertical pans scroll the page; horizontal drags still rotate.
    if (!enableZoom && rawControls.domElement != null)
      rawControls.domElement.style.touchAction = 'pan-y'

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

      // Free the WebGL renderer/context. Without this every mount leaks a
      // context and browsers cap live contexts, eventually breaking the globe.
      globeInstance?._destructor?.()
      globeInstance = null
      globeMaterial = null
    }

    // Hex features stream in last so a destroy mid-feed only has to stop the feed.
    const instance = globeInstance
    const material = globeMaterial
    await feedHexFeatures(featureCollection.features)

    return {
      globeInstance: instance,
      globeMaterial: material,
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

    // Free the WebGL renderer/context. Without this every mount leaks a
    // context and browsers cap live contexts, eventually breaking the globe.
    globeInstance?._destructor?.()
    globeInstance = null
    globeMaterial = null
  }

  onBeforeUnmount(destroy)

  return { init, destroy }
}
