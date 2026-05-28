<script setup lang="ts">
import type { CountryFeature, FeatureCollection } from '@/composables/useGlobeData'

import { Badge, Button, ButtonGroup, Flex, Skeleton, Spinner, Tooltip } from '@dolanske/vui'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
import { useAdminGlobeData } from '@/composables/useAdminGlobeData'
import { useDataMetrics } from '@/composables/useDataMetrics'
import { useGlobeBase } from '@/composables/useGlobeBase'
import { useGlobePerf } from '@/composables/useGlobePerf'
import {
  getHexBaseColor,
  getHighlightColor,
  getTextColor,
} from '@/lib/globe/GlobeTheme'
import { getCountryEmoji } from '@/lib/utils/country'

const emit = defineEmits<{ countryClick: [iso: string] }>()

const globeWrapEl = ref<HTMLDivElement | null>(null)

const { onlineCountsByCountry, loading, fetchOnlineUsers, fetchCountryUsers, fetchCountryAllUsers } = useAdminGlobeData()
const { latestMetrics, loadingLatest, fetchLatestMetrics } = useDataMetrics()
const { params: perfParams } = useGlobePerf()

// Map of country ISO -> online count
const onlineMap = computed<Map<string, number>>(() => {
  const m = new Map<string, number>()
  for (const entry of onlineCountsByCountry.value) {
    m.set(entry.country.toUpperCase(), entry.count)
  }
  return m
})

// Map of country ISO -> total count from metrics snapshot
const allMap = computed<Map<string, number>>(() => {
  const m = new Map<string, number>()
  for (const [country, count] of Object.entries(latestMetrics.value?.users.byCountry ?? {})) {
    const iso = country.toUpperCase()
    if (/^[A-Z]{2}$/.test(iso))
      m.set(iso, count)
  }
  return m
})

// View mode: online = show only online users, all = show all users by count
type GlobeMode = 'online' | 'all'
const mode = ref<GlobeMode>('all')

// Tooltip state
const tooltip = ref<{ x: number, y: number, country: string, flag: string, iso: string, userIds: string[], userCount: number, usersLoading: boolean } | null>(null)
let hoverFetchTimer: ReturnType<typeof setTimeout> | null = null
const userCache = new Map<string, string[]>()
let tooltipClearTimer: ReturnType<typeof setTimeout> | null = null

function scheduleTooltipClear() {
  if (tooltipClearTimer != null)
    clearTimeout(tooltipClearTimer)
  tooltipClearTimer = setTimeout(() => {
    tooltip.value = null
    tooltipClearTimer = null
  }, 80)
}

function cancelTooltipClear() {
  if (tooltipClearTimer != null) {
    clearTimeout(tooltipClearTimer)
    tooltipClearTimer = null
  }
}

let lastMouseX = 0
let lastMouseY = 0

function onMouseMove(e: MouseEvent) {
  lastMouseX = e.clientX
  lastMouseY = e.clientY
  if (tooltip.value) {
    tooltip.value = { ...tooltip.value, x: lastMouseX, y: lastMouseY }
  }
}

// Total online users count
const totalOnlineCount = computed(() => {
  let count = 0
  for (const entry of onlineCountsByCountry.value) count += entry.count
  return count
})

// Total all users count (from metrics snapshot)
const totalAllCount = computed(() => {
  let count = 0
  for (const v of allMap.value.values()) count += v
  return count
})
const hoveredIso = ref('')
const hoveredHasUsers = computed(() => {
  const count = mode.value === 'online' ? (onlineMap.value.get(hoveredIso.value) ?? 0) : (allMap.value.get(hoveredIso.value) ?? 0)
  return count > 0
})

// True once the globe has finished its initial mount sequence
const globeReady = ref(false)
// Dim the globe while data is loading after initial render (mirrors UserTable's table-loading pattern)
const isGlobeLoading = computed(() => globeReady.value && (loading.value || loadingLatest.value))

let globeInstance: import('globe.gl').GlobeInstance | null = null
let globeBaseDestroy: (() => void) | null = null

const { init: initGlobeBase } = useGlobeBase()

onMounted(async () => {
  if (!import.meta.client)
    return

  await Promise.all([fetchOnlineUsers(), fetchLatestMetrics()])

  const wrap = globeWrapEl.value
  if (!wrap)
    return

  wrap.addEventListener('mousemove', onMouseMove)
  wrap.addEventListener('mouseleave', () => {
    tooltip.value = null
  })

  try {
    const res = await fetch('/geojson/countries.geojson')
    if (!res.ok)
      throw new Error(`Failed to load countries GeoJSON: ${res.status}`)

    const featureCollection = await res.json() as FeatureCollection
    const { MeshBasicMaterial } = await import('three')

    const baseResult = await initGlobeBase({
      container: wrap,
      featureCollection,
      perfParams: perfParams.value,
      autoRotateSpeed: 0.5,
      enableZoom: true,
      pointOfView: { lat: 30, lng: 10, altitude: 2.2 },
    })
    globeInstance = baseResult.globeInstance
    globeBaseDestroy = baseResult.destroy

    const parseHex = (color: string): [number, number, number] => {
      const hex = color.replace(/^#/, '')
      return [
        Number.parseInt(hex.slice(0, 2), 16),
        Number.parseInt(hex.slice(2, 4), 16),
        Number.parseInt(hex.slice(4, 6), 16),
      ]
    }

    const refreshHexColors = () => {
      const [r, g, b] = parseHex(getHighlightColor())
      const allMaxCount = Math.max(1, ...Array.from(allMap.value.values()))
      const onlineMaxCount = Math.max(1, ...Array.from(onlineMap.value.values()))

      globeInstance?.hexPolygonColor((d: unknown) => {
        const feat = d as CountryFeature
        const iso = (feat.id ?? '') as string
        const baseHex = getHexBaseColor()
        if (!iso)
          return baseHex
        if (hoveredIso.value && iso.toUpperCase() === hoveredIso.value) {
          const isoUpper = iso.toUpperCase()
          const hasUsers = mode.value === 'all'
            ? (allMap.value.get(isoUpper) ?? 0) > 0
            : (onlineMap.value.get(isoUpper) ?? 0) > 0
          const [tr, tg, tb] = parseHex(getTextColor())
          const alpha = hasUsers ? 1.0 : 0.15
          return `rgba(${tr},${tg},${tb},${alpha})`
        }
        if (mode.value === 'all') {
          const count = allMap.value.get(iso.toUpperCase()) ?? 0
          if (count > 0) {
            const alpha = 0.2 + (count / allMaxCount) * 0.8
            return `rgba(${r},${g},${b},${alpha})`
          }
        }
        else {
          const onlineCount = onlineMap.value.get(iso.toUpperCase()) ?? 0
          if (onlineCount > 0) {
            const alpha = 0.2 + (onlineCount / onlineMaxCount) * 0.8
            return `rgba(${r},${g},${b},${alpha})`
          }
        }
        return baseHex
      })
    }

    watch(mode, () => {
      userCache.clear()
      refreshHexColors()
    })
    watch(allMap, refreshHexColors)

    globeInstance
      .enablePointerInteraction(true)
      // Invisible polygon layer for whole-country hover detection
      // Filter out Bermuda (id: BMU) - its GeoJSON polygon covers most of the Atlantic
      .polygonsData(featureCollection.features.filter((f) => {
        return (f.id ?? '') !== 'BMU'
      }))
      .polygonCapMaterial(new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false }))
      .polygonSideMaterial(new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false }))
      .polygonStrokeColor(() => false)
      .polygonAltitude(0.01)
      .onPolygonClick((polygon: object | null) => {
        if (!polygon)
          return
        const feat = polygon as CountryFeature
        const iso = ((feat.id ?? '') as string).toUpperCase()
        const userCount = mode.value === 'online' ? (onlineMap.value.get(iso) ?? 0) : (allMap.value.get(iso) ?? 0)
        if (iso && userCount > 0)
          emit('countryClick', iso)
      })
      .onPolygonHover((polygon: object | null) => {
        if (!polygon) {
          hoveredIso.value = ''
          refreshHexColors()
          scheduleTooltipClear()
          if (hoverFetchTimer != null) {
            clearTimeout(hoverFetchTimer)
            hoverFetchTimer = null
          }
          return
        }
        cancelTooltipClear()
        const feat = polygon as CountryFeature
        const iso = (feat.id ?? '') as string
        const isoUpper = iso.toUpperCase()
        // Only re-trigger fetch if country changed
        if (hoveredIso.value === isoUpper)
          return
        hoveredIso.value = isoUpper
        refreshHexColors()
        const countryName = feat.properties.ADMIN ?? feat.properties.name ?? iso
        const onlineCount = onlineMap.value.get(isoUpper) ?? 0
        const allCount = allMap.value.get(isoUpper) ?? 0
        const userCount = mode.value === 'online' ? onlineCount : allCount
        // Show tooltip immediately with count and loading state
        tooltip.value = {
          x: lastMouseX,
          y: lastMouseY,
          country: countryName ?? iso,
          flag: getCountryEmoji(isoUpper),
          iso: isoUpper,
          userIds: [],
          userCount,
          usersLoading: userCount > 0,
        }
        if (userCount === 0)
          return
        // Check cache first
        const cacheKey = `${mode.value}:${isoUpper}`
        const cached = userCache.get(cacheKey)
        if (cached) {
          tooltip.value = { ...tooltip.value!, userIds: cached, usersLoading: false }
          return
        }
        // Debounce the actual user fetch
        if (hoverFetchTimer != null)
          clearTimeout(hoverFetchTimer)
        hoverFetchTimer = setTimeout(async () => {
          hoverFetchTimer = null
          try {
            const result = mode.value === 'online'
              ? await fetchCountryUsers(isoUpper)
              : await fetchCountryAllUsers(isoUpper)
            // Only update if still hovering same country
            if (tooltip.value?.iso === isoUpper) {
              userCache.set(cacheKey, result.userIds)
              tooltip.value = {
                ...tooltip.value,
                userIds: result.userIds,
                userCount: mode.value === 'online' ? result.total : allCount,
                usersLoading: false,
              }
            }
          }
          catch {
            if (tooltip.value?.iso === isoUpper)
              tooltip.value = { ...tooltip.value, usersLoading: false }
          }
        }, 200)
      })

    // Pause spin on drag, resume after 15s idle
    let idleTimer: ReturnType<typeof setTimeout> | null = null
    const resumeRotation = () => {
      if (globeInstance)
        globeInstance.controls().autoRotate = true
    }
    const onInteract = () => {
      if (globeInstance)
        globeInstance.controls().autoRotate = false
      if (idleTimer != null)
        clearTimeout(idleTimer)
      idleTimer = setTimeout(resumeRotation, 15000)
    }
    globeInstance.controls().addEventListener('start', onInteract)

    refreshHexColors()
    globeReady.value = true
  }
  catch (error) {
    console.error('Error initializing admin globe:', error)
  }
})

onBeforeUnmount(() => {
  if (hoverFetchTimer != null) {
    clearTimeout(hoverFetchTimer)
    hoverFetchTimer = null
  }
  if (tooltipClearTimer != null) {
    clearTimeout(tooltipClearTimer)
    tooltipClearTimer = null
  }
  globeBaseDestroy?.()
  globeInstance?._destructor?.()
  if (globeWrapEl.value)
    globeWrapEl.value.replaceChildren()
})
</script>

<template>
  <div class="admin-globe-outer">
    <div class="admin-globe-controls">
      <ButtonGroup vertical>
        <Tooltip placement="right">
          <Button square size="s" :variant="mode === 'all' ? 'accent' : 'gray'" @click="mode = 'all'">
            <Icon name="ph:users-four" size="16" />
          </Button>
          <template #tooltip>
            All users
          </template>
        </Tooltip>
        <Tooltip placement="right">
          <Button square size="s" :variant="mode === 'online' ? 'accent' : 'gray'" @click="mode = 'online'">
            <Icon name="ph:user" size="16" />
          </Button>
          <template #tooltip>
            Online now
          </template>
        </Tooltip>
      </ButtonGroup>
    </div>
    <div class="admin-globe-badge">
      <Tooltip placement="bottom">
        <Badge :variant="mode === 'online' ? 'accent' : 'neutral'">
          <template v-if="(mode === 'online' && loading) || (mode === 'all' && loadingLatest)">
            <Skeleton width="60px" height="10px" />
          </template>
          <template v-else>
            {{ mode === 'online' ? `${totalOnlineCount} Online` : `${totalAllCount} Users` }}
          </template>
        </Badge>
        <template #tooltip>
          Only users with a country set
        </template>
      </Tooltip>
    </div>

    <div ref="globeWrapEl" class="admin-globe-wrap" :class="{ 'admin-globe-wrap--loading': isGlobeLoading }" :style="{ cursor: hoveredHasUsers ? 'pointer' : 'default' }">
      <Flex v-if="loading" class="admin-globe-loading" x-center y-center>
        <Spinner size="l" />
      </Flex>

      <!-- Tooltip -->
      <Teleport to="body">
        <div
          v-if="tooltip"
          class="admin-globe-tooltip"
          :style="{ left: `${tooltip.x + 14}px`,
                    top: `${tooltip.y - 10}px` }"
        >
          <div class="admin-globe-tooltip__header">
            <div class="admin-globe-tooltip__country">
              {{ tooltip.flag }} {{ tooltip.country }}
            </div>
            <div class="admin-globe-tooltip__count">
              {{ tooltip.userCount.toLocaleString() }} user{{ tooltip.userCount !== 1 ? 's' : '' }}
            </div>
          </div>
          <template v-if="tooltip.userCount > 0">
            <div class="admin-globe-tooltip__users">
              <template v-if="tooltip.usersLoading">
                <Flex
                  v-for="i in Math.min(tooltip.userCount, 10)"
                  :key="i"
                  gap="s"
                  y-center
                >
                  <Skeleton circle width="28px" height="28px" />
                  <Skeleton width="90px" height="10px" />
                </Flex>
              </template>
              <template v-else>
                <UserDisplay
                  v-for="id in tooltip.userIds"
                  :key="id"
                  :user-id="id"
                  size="s"
                />
                <span v-if="tooltip.userCount > 10" class="admin-globe-tooltip__more">
                  +{{ tooltip.userCount - 10 }} more
                </span>
              </template>
            </div>
          </template>
        </div>
      </Teleport>
    </div>
  </div>
</template>

<style scoped lang="scss">
.admin-globe-outer {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}

.admin-globe-controls {
  position: absolute;
  z-index: 100;
  left: 10px;
  top: 10px;
}

.admin-globe-wrap {
  position: relative;
  width: 100%;
  height: calc(100vh - 310px);
  min-height: 400px;
  border-radius: var(--border-radius-m);
  overflow: hidden;
  background: var(--color-bg-lowered);
  transition: opacity var(--transition-slow);

  &--loading {
    opacity: 0.4;
    pointer-events: none;
  }
}

.admin-globe-loading {
  position: absolute;
  inset: 0;
  z-index: 2;
}

.admin-globe-badge {
  position: absolute;
  z-index: 10;
  top: 10px;
  right: 10px;
}
</style>

<style lang="scss">
.admin-globe-tooltip {
  position: fixed;
  z-index: var(--z-tooltip, 9999);
  background: var(--color-bg-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-s);
  padding: var(--space-xs) var(--space-s);
  pointer-events: none;
  max-width: 320px;

  &__header {
    display: flex;
    align-items: baseline;
    gap: var(--space-xs);
    margin-bottom: var(--space-xs);
  }

  &__country {
    font-size: var(--font-size-s);
    font-weight: 600;
    color: var(--color-text);
  }

  &__users {
    display: flex;
    flex-direction: column;
    gap: var(--space-xxs);
  }

  &__more {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    padding-top: var(--space-xxs);
  }

  &__count {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    white-space: nowrap;
  }
}
</style>
