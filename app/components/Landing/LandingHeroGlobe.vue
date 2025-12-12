<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useMetrics } from '@/composables/useMetrics'

type PolygonCoords = number[][][]
type MultiPolygonCoords = number[][][][]

interface CountryFeature {
  type: 'Feature'
  id?: string
  properties: { ADMIN?: string, ISO_A2?: string, ISO_A3?: string, POP_EST?: number, name?: string }
  geometry?: {
    type: 'Polygon'
    coordinates: PolygonCoords
  } | {
    type: 'MultiPolygon'
    coordinates: MultiPolygonCoords
  }
}

interface FeatureCollection {
  type: 'FeatureCollection'
  features: CountryFeature[]
}

type GlobeConstructor = typeof import('globe.gl')['default']
type GlobeInstance = import('globe.gl').GlobeInstance

const globeEl = ref<HTMLDivElement | null>(null)
let globeInstance: GlobeInstance | null = null
let resizeObserver: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null
let themeMedia: MediaQueryList | null = null
let globeMaterial: import('three').MeshStandardMaterial | null = null
const BACKGROUND_COLOR = 'rgba(0,0,0,0)'
const GLOBE_COLOR_DARK = '#060606'
const GLOBE_COLOR_LIGHT = '#fff'
const ARC_COLOR_DARK = '#a7fc2f'
const ARC_COLOR_LIGHT = '#225500'
const HEX_HIGHLIGHT_COLOR_DARK = '#d9ff6b'
const HEX_HIGHLIGHT_COLOR_LIGHT = '#225500'
const ATMOSPHERE_COLOR = '#ddffcc'
const HEX_COLOR_DARK = '#333333'
const HEX_COLOR_LIGHT = '#DDDDDD'
const RING_COLOR_RGB_DARK = '217,255,107'
const RING_COLOR_RGB_LIGHT = '88,170,64'
const FLIGHT_TIME = 3200
const ARC_REL_LEN = 0.35
const RING_MAX_R = 24
const RING_PROPAGATION_SPEED = 6
const RING_REPEAT_PERIOD = Infinity
const MAX_CONCURRENT_ARCS = 8
const MIN_METRIC_COUNTRIES = 25
const ARC_INTERVAL = Math.max(600, Math.floor(FLIGHT_TIME / 2))
const HIGHLIGHT_FADE_MS = 2000
const HIGHLIGHT_START_MS = 1200

interface CountryPoint {
  lat: number
  lng: number
  iso?: string
}

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

let arcInterval: ReturnType<typeof setInterval> | null = null
let timeouts: ReturnType<typeof setTimeout>[] = []
let animationFrame: number | null = null
const highlighted = new Map<string, { started: number, duration: number }>()
const { fetchMetrics } = useMetrics()
let maxConcurrentArcs = MAX_CONCURRENT_ARCS

function clearTimers() {
  if (arcInterval)
    clearInterval(arcInterval)
  timeouts.forEach(clearTimeout)
  arcInterval = null
  timeouts = []
  if (animationFrame)
    cancelAnimationFrame(animationFrame)
  animationFrame = null
  themeObserver?.disconnect()
  themeObserver = null
  themeMedia?.removeEventListener('change', applyGlobeColor)
  themeMedia = null
  globeMaterial = null
}

function polygonCentroid(coords: PolygonCoords | MultiPolygonCoords | undefined): { lat: number, lng: number } | null {
  if (!coords || !Array.isArray(coords) || coords.length === 0)
    return null
  const first = coords[0]
  if (!first || !Array.isArray(first))
    return null
  const isMulti = Array.isArray((first as unknown[])[0]) && Array.isArray(((first as unknown[])[0] as unknown[])[0])
  const ring = isMulti ? (coords as MultiPolygonCoords)[0]?.[0] : (coords as PolygonCoords)[0]
  if (!ring || !Array.isArray(ring))
    return null
  const normalizeLng = (lng: number) => ((lng + 180) % 360 + 360) % 360 - 180
  let sumLat = 0
  let sumLng = 0
  let count = 0
  for (const pt of ring) {
    if (!Array.isArray(pt) || pt.length < 2)
      continue
    const [lng, lat] = pt
    if (typeof lng !== 'number' || typeof lat !== 'number')
      continue
    sumLng += normalizeLng(lng)
    sumLat += lat
    count++
  }
  if (!count)
    return null
  return { lat: sumLat / count, lng: sumLng / count }
}

function countryCode(feat: CountryFeature): string | undefined {
  return feat.properties.ISO_A2
    ?? feat.id
    ?? feat.properties.ADMIN
    ?? feat.properties.name
}

function normalizeMetricCountryCode(code: string | null | undefined, iso3Map: Map<string, string>): string | null {
  if (!code)
    return null

  const normalized = code.trim().toUpperCase()
  if (/^[A-Z]{2}$/.test(normalized))
    return normalized

  if (/^[A-Z]{3}$/.test(normalized))
    return iso3Map.get(normalized) ?? null

  return null
}

function blendHex(from: string, to: string, t: number): string {
  const clamp = Math.max(0, Math.min(1, t))
  const parse = (hex: string): [number, number, number] => {
    const parts = hex.replace('#', '').match(/.{1,2}/g) ?? ['00', '00', '00']
    const [r = '00', g = '00', b = '00'] = parts
    return [Number.parseInt(r, 16), Number.parseInt(g, 16), Number.parseInt(b, 16)]
  }
  const [r1, g1, b1] = parse(from)
  const [r2, g2, b2] = parse(to)
  const r = Math.round(r1 + (r2 - r1) * clamp).toString(16).padStart(2, '0')
  const g = Math.round(g1 + (g2 - g1) * clamp).toString(16).padStart(2, '0')
  const b = Math.round(b1 + (b2 - b1) * clamp).toString(16).padStart(2, '0')
  return `#${r}${g}${b}`
}

function isLightTheme(): boolean {
  if (typeof window === 'undefined')
    return false
  const root = document.documentElement
  const dataTheme = root.getAttribute('data-theme')?.toLowerCase()
  if (dataTheme === 'light')
    return true
  if (dataTheme === 'dark')
    return false
  if (root.classList.contains('light'))
    return true
  if (root.classList.contains('dark'))
    return false
  const media = window.matchMedia?.('(prefers-color-scheme: light)')
  return Boolean(media?.matches)
}

function applyGlobeColor() {
  if (!globeMaterial)
    return
  const color = isLightTheme() ? GLOBE_COLOR_LIGHT : GLOBE_COLOR_DARK
  globeMaterial.color.set(color)
}

function getArcColor() {
  return isLightTheme() ? ARC_COLOR_LIGHT : ARC_COLOR_DARK
}

function getHighlightColor() {
  return isLightTheme() ? HEX_HIGHLIGHT_COLOR_LIGHT : HEX_HIGHLIGHT_COLOR_DARK
}

function getHexBaseColor() {
  return isLightTheme() ? HEX_COLOR_LIGHT : HEX_COLOR_DARK
}

function getRingRgb() {
  return isLightTheme() ? RING_COLOR_RGB_LIGHT : RING_COLOR_RGB_DARK
}

onMounted(async () => {
  if (!import.meta.client)
    return
  const container = globeEl.value
  if (!container)
    return

  try {
    const Globe = (await import('globe.gl')).default as GlobeConstructor
    const { MeshStandardMaterial } = await import('three')
    const res = await fetch('/geojson/countries.geojson')
    if (!res.ok)
      throw new Error('Failed to load countries geojson')
    const countries: FeatureCollection = await res.json()
    const iso3ToIso2 = new Map<string, string>()
    const centroids = countries.features
      .map((feat) => {
        const point = polygonCentroid(feat.geometry?.coordinates)
        if (!point)
          return null
        const iso2 = countryCode(feat)
        const iso3 = feat.properties.ISO_A3?.toUpperCase()
        if (iso2 && iso3)
          iso3ToIso2.set(iso3, iso2)

        return { ...point, iso: iso2 }
      })
      .filter(Boolean) as CountryPoint[]
    if (centroids.length < 2)
      return

    let sourceCentroids = centroids
    let usingGlobalFallback = true
    try {
      const metricsSnapshot = await fetchMetrics()
      const userCountries = metricsSnapshot.breakdowns?.usersByCountry ?? {}
      const allowedIso = new Set<string>()

      for (const code of Object.keys(userCountries)) {
        const normalized = normalizeMetricCountryCode(code, iso3ToIso2)
        if (normalized)
          allowedIso.add(normalized)
      }

      const filtered = centroids.filter(point => point.iso && allowedIso.has(point.iso))
      if (filtered.length >= MIN_METRIC_COUNTRIES) {
        sourceCentroids = filtered
        usingGlobalFallback = false
      }
    }
    catch (err) {
      console.error('Error fetching metrics for globe:', err)
    }

    if (usingGlobalFallback) {
      maxConcurrentArcs = MAX_CONCURRENT_ARCS
    }
    else {
      const count = sourceCentroids.length
      const scaled = Math.round((count / MIN_METRIC_COUNTRIES) * MAX_CONCURRENT_ARCS)
      maxConcurrentArcs = Math.max(1, Math.min(MAX_CONCURRENT_ARCS, scaled))
    }

    globeInstance = new Globe(container)
    globeMaterial = new MeshStandardMaterial({ color: isLightTheme() ? GLOBE_COLOR_LIGHT : GLOBE_COLOR_DARK, roughness: 1, metalness: 0 })
    const setSize = () => {
      const { width, height } = container.getBoundingClientRect()
      globeInstance?.width(width).height(height)
    }
    setSize()

    resizeObserver = new ResizeObserver(() => setSize())
    resizeObserver.observe(container)
    globeInstance
      .globeMaterial(globeMaterial)
      .hexPolygonsData(countries.features)
      .hexPolygonResolution(3)
      .hexPolygonMargin(0.3)
      .hexPolygonUseDots(true)
      .hexPolygonColor((d: unknown) => {
        const iso = countryCode(d as CountryFeature)
        const baseHex = getHexBaseColor()
        if (!iso)
          return baseHex
        const entry = highlighted.get(iso)
        if (!entry)
          return baseHex
        const elapsed = performance.now() - entry.started
        if (elapsed >= entry.duration) {
          highlighted.delete(iso)
          return baseHex
        }
        const progress = elapsed / entry.duration
        return blendHex(getHighlightColor(), baseHex, progress)
      })
      .backgroundColor(BACKGROUND_COLOR)
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

    themeMedia = window.matchMedia?.('(prefers-color-scheme: light)') ?? null
    themeMedia?.addEventListener('change', applyGlobeColor)
    themeObserver = new MutationObserver(applyGlobeColor)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    applyGlobeColor()

    // Add auto-rotation
    globeInstance.controls().autoRotate = true
    globeInstance.controls().autoRotateSpeed = -0.4
    globeInstance.controls().enableZoom = false

    // Nudge camera slightly closer (~10%)
    const startLng = Math.random() * 360 - 180
    const startLat = 10 + Math.random() * 50 // keep within a viewable band
    globeInstance.pointOfView({ lat: startLat, lng: startLng, altitude: 1.9 }, 0)

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
      if (centroids.length < 2)
        return
      const srcPool = sourceCentroids.length > 0 ? sourceCentroids : centroids
      const src = srcPool[Math.floor(Math.random() * srcPool.length)]!
      let dst = centroids[Math.floor(Math.random() * centroids.length)]!
      let guard = 0
      while ((dst === src || (Math.abs(dst.lat - src.lat) + Math.abs(dst.lng - src.lng)) < 10) && guard < 5) {
        dst = centroids[Math.floor(Math.random() * centroids.length)]!
        guard++
      }

      if (!src || !dst)
        return

      const arc: ArcDatum = { startLat: src.lat, startLng: src.lng, endLat: dst.lat, endLng: dst.lng }
      const srcRing: RingDatum = { lat: src.lat, lng: src.lng }
      const dstRing: RingDatum = { lat: dst.lat, lng: dst.lng }

      arcs.push(arc)
      rings.push(srcRing)
      if (src.iso) {
        highlighted.set(src.iso, { started: performance.now(), duration: HIGHLIGHT_START_MS })
        refreshHexes()
      }
      pushData()

      timeouts.push(setTimeout(() => {
        rings.push(dstRing)
        pushData()
        if (dst.iso) {
          highlighted.set(dst.iso, { started: performance.now(), duration: HIGHLIGHT_FADE_MS })
          refreshHexes()
        }
      }, FLIGHT_TIME))

      timeouts.push(setTimeout(() => {
        const arcIdx = arcs.indexOf(arc)
        if (arcIdx >= 0)
          arcs.splice(arcIdx, 1)
        pushData()
      }, FLIGHT_TIME * 2))

      timeouts.push(setTimeout(() => {
        removeRing(srcRing)
        removeRing(dstRing)
        pushData()
      }, FLIGHT_TIME + (FLIGHT_TIME * ARC_REL_LEN)))
    }

    arcInterval = setInterval(() => {
      if (arcs.length < maxConcurrentArcs)
        spawnArc()
    }, ARC_INTERVAL)

    const tick = () => {
      refreshHexes()
      animationFrame = requestAnimationFrame(tick)
    }
    tick()

    const initial = Math.min(maxConcurrentArcs, Math.max(sourceCentroids.length, centroids.length))
    for (let i = 0; i < initial; i++) {
      setTimeout(spawnArc, i * (ARC_INTERVAL / 2))
    }
  }
  catch (error) {
    console.error('Error initializing globe:', error)
  }
})

onBeforeUnmount(() => {
  globeInstance?.pauseAnimation?.()
  globeInstance = null
  clearTimers()
  resizeObserver?.disconnect()
  resizeObserver = null
  if (globeEl.value)
    globeEl.value.replaceChildren()
})
</script>

<template>
  <div ref="globeEl" class="hero-globe" aria-hidden="true" />
</template>

<style scoped lang="scss">
.hero-globe {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: auto;
  z-index: 2;
  opacity: 0.95;
}
</style>
