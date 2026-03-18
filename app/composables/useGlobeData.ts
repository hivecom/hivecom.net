// useGlobeData.ts
// Owns everything related to geographic data and user-metrics filtering:
//   - Fetching and parsing the countries GeoJSON
//   - Computing polygon centroids
//   - Normalising ISO-2 / ISO-3 country codes
//   - Fetching platform metrics and filtering centroids to countries with users

import { useDataMetrics } from '@/composables/useDataMetrics'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PolygonCoords = number[][][]
type MultiPolygonCoords = number[][][][]

export interface CountryFeature {
  type: 'Feature'
  id?: string
  properties: {
    ADMIN?: string
    ISO_A2?: string
    ISO_A3?: string
    POP_EST?: number
    name?: string
  }
  geometry?:
    | { type: 'Polygon', coordinates: PolygonCoords }
    | { type: 'MultiPolygon', coordinates: MultiPolygonCoords }
}

export interface FeatureCollection {
  type: 'FeatureCollection'
  features: CountryFeature[]
}

export interface CountryPoint {
  lat: number
  lng: number
  iso?: string
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

const ISO2_RE = /^[A-Z]{2}$/
const ISO3_RE = /^[A-Z]{3}$/

/** Lowest meaningful country count before we fall back to the full globe. */
const MIN_METRIC_COUNTRIES = 25

function polygonCentroid(
  coords: PolygonCoords | MultiPolygonCoords | undefined,
): { lat: number, lng: number } | null {
  if (!coords || !Array.isArray(coords) || coords.length === 0)
    return null

  const first = coords[0]
  if (!first || !Array.isArray(first))
    return null

  const isMulti
    = Array.isArray((first as unknown[])[0])
      && Array.isArray(((first as unknown[])[0] as unknown[])[0])

  const ring = isMulti
    ? (coords as MultiPolygonCoords)[0]?.[0]
    : (coords as PolygonCoords)[0]

  if (!ring || !Array.isArray(ring))
    return null

  const normalizeLng = (lng: number) =>
    ((((lng + 180) % 360) + 360) % 360) - 180

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
  return (
    feat.properties.ISO_A2
    ?? feat.id
    ?? feat.properties.ADMIN
    ?? feat.properties.name
  )
}

function normalizeMetricCountryCode(
  code: string | null | undefined,
  iso3Map: Map<string, string>,
): string | null {
  if (code == null || code === '')
    return null
  const normalized = code.trim().toUpperCase()
  if (ISO2_RE.test(normalized))
    return normalized
  if (ISO3_RE.test(normalized))
    return iso3Map.get(normalized) ?? null
  return null
}

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

export interface GlobeDataResult {
  /** Every country centroid derived from the GeoJSON. */
  allCentroids: CountryPoint[]
  /**
   * Centroid subset filtered to countries that actually have platform users.
   * Falls back to `allCentroids` when metrics are unavailable or the filtered
   * set is too small.
   */
  sourceCentroids: CountryPoint[]
  /** Raw GeoJSON feature collection - needed for hexPolygonsData. */
  featureCollection: FeatureCollection
  /**
   * Whether `sourceCentroids` fell back to the full globe because the
   * metrics-filtered set was below MIN_METRIC_COUNTRIES.
   */
  usingGlobalFallback: boolean
  /**
   * Suggested maxConcurrentArcs scaled to the size of `sourceCentroids`
   * relative to MIN_METRIC_COUNTRIES. Always between 1 and `maxArcs`.
   */
  scaledArcCount: (maxArcs: number) => number
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export function useGlobeData() {
  const { fetchMetrics } = useDataMetrics()

  /**
   * Fetches and processes all globe data. Throws on unrecoverable errors
   * (e.g. GeoJSON fetch failure); metrics errors are handled gracefully by
   * falling back to the global centroid set.
   */
  async function loadGlobeData(): Promise<GlobeDataResult> {
    const res = await fetch('/geojson/countries.geojson')
    if (!res.ok)
      throw new Error(`Failed to load countries GeoJSON: ${res.status}`)

    // eslint-disable-next-line ts/no-unsafe-assignment
    const featureCollection: FeatureCollection = await res.json()

    // Build ISO-3 → ISO-2 lookup and centroid list in a single pass.
    const iso3ToIso2 = new Map<string, string>()
    const allCentroids: CountryPoint[] = []

    for (const feat of featureCollection.features) {
      const point = polygonCentroid(feat.geometry?.coordinates)
      if (!point)
        continue

      const iso2 = countryCode(feat)
      const iso3 = feat.properties.ISO_A3?.toUpperCase()
      if (iso2 != null && iso2 !== '' && iso3 != null && iso3 !== '')
        iso3ToIso2.set(iso3, iso2)

      allCentroids.push({ ...point, iso: iso2 })
    }

    if (allCentroids.length < 2)
      throw new Error('Insufficient centroid data from GeoJSON')

    // Attempt to narrow to countries that have platform users.
    let sourceCentroids = allCentroids
    let usingGlobalFallback = true

    try {
      const metricsSnapshot = await fetchMetrics()
      const userCountries = metricsSnapshot.breakdowns?.usersByCountry ?? {}
      const allowedIso = new Set<string>()

      for (const code of Object.keys(userCountries)) {
        const normalized = normalizeMetricCountryCode(code, iso3ToIso2)
        if (normalized != null && normalized !== '')
          allowedIso.add(normalized)
      }

      const filtered = allCentroids.filter(
        point => point.iso != null && allowedIso.has(point.iso),
      )

      if (filtered.length >= MIN_METRIC_COUNTRIES) {
        sourceCentroids = filtered
        usingGlobalFallback = false
      }
    }
    catch (err) {
      console.error('Globe: metrics fetch failed, using global fallback:', err)
    }

    function scaledArcCount(maxArcs: number): number {
      if (usingGlobalFallback)
        return maxArcs
      const count = sourceCentroids.length
      const scaled = Math.round((count / MIN_METRIC_COUNTRIES) * maxArcs)
      return Math.max(1, Math.min(maxArcs, scaled))
    }

    return {
      allCentroids,
      sourceCentroids,
      featureCollection,
      usingGlobalFallback,
      scaledArcCount,
    }
  }

  return { loadGlobeData }
}
