<script setup lang="ts">
import type { MetricsHistoryEntry, MetricsPeriod } from '@/composables/useDataMetrics'
import { Button, ButtonGroup, Calendar, Dropdown, DropdownItem, Flex, theme, Tooltip } from '@dolanske/vui'
import { useElementSize } from '@vueuse/core'
import { computed, onMounted, ref, watch } from 'vue'
import { METRICS_PERIOD_OPTIONS, PERIOD_CONFIGS, useDataMetrics } from '@/composables/useDataMetrics'
import { getCSSVariable } from '@/lib/utils/common'

type SeriesKey = 'usersOnline' | 'teamspeakOnline' | 'gameserversPlayers' | 'usersGameActivity' | 'usersSteamGameActivity'

interface SeriesDef {
  key: SeriesKey
  label: string
  paletteIndex: number
}

const props = withDefaults(defineProps<{
  series?: SeriesKey[]
  color?: string
  initialPeriod?: MetricsPeriod
  initialWindow?: { start: Date, end: Date } | null
  gameId?: number
  steamGameId?: number
  serverId?: number
  serverName?: string
}>(), {
  series: () => ['usersOnline', 'teamspeakOnline', 'gameserversPlayers'] as SeriesKey[],
  color: () => getCSSVariable('--color-accent'),
})

const emit = defineEmits<{
  'change': [{ start: Date, end: Date }]
  'update:utc': [boolean]
}>()

const ALL_SERIES: SeriesDef[] = [
  { key: 'usersOnline', label: 'Users', paletteIndex: 1 },
  { key: 'teamspeakOnline', label: 'TeamSpeak', paletteIndex: 0 },
  { key: 'gameserversPlayers', label: 'Servers', paletteIndex: 3 },
  { key: 'usersGameActivity', label: 'Games', paletteIndex: 4 },
  { key: 'usersSteamGameActivity', label: 'Steam Games', paletteIndex: 2 },
]

const { metricsOverview, fetchMetricsOverview } = useDataMetrics()

// ── Canvas ────────────────────────────────────────────────────────────────────

const wrapperRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const { width: wrapperWidth } = useElementSize(wrapperRef, { width: 0, height: 0 })

const CANVAS_HEIGHT = 56

// ── Brush state ───────────────────────────────────────────────────────────────

const brushStart = ref<number | null>(null)
const brushEnd = ref<number | null>(null)
const isDragging = ref(false)
const hoverX = ref<number | null>(null)
const hoverTimestamp = ref<number | null>(null)

// ── UTC toggle ────────────────────────────────────────────────────────────────

const useUtc = ref(false)
watch(useUtc, val => emit('update:utc', val))

function formatTimestamp(ms: number): string {
  const d = new Date(ms)
  if (useUtc.value) {
    return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC')
  }
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`
}

// ── Selection mode ───────────────────────────────────────────────────────────

type SelectionMode = 'period' | 'calendar' | 'brush'
const selectionMode = ref<SelectionMode>('period')

// ── Period chips ──────────────────────────────────────────────────────────────

const activePeriod = ref<MetricsPeriod>(props.initialPeriod ?? '7d')

function applyWindow(start: Date, end: Date) {
  brushStart.value = start.getTime()
  brushEnd.value = end.getTime()
  emit('change', { start, end })
}

function applyPeriod(period: MetricsPeriod) {
  selectionMode.value = 'period'
  activePeriod.value = period
  const config = PERIOD_CONFIGS[period]
  const end = new Date()
  const start = new Date(Date.now() - config.hours * 60 * 60 * 1000)
  applyWindow(start, end)
}

// ── Calendar range picker ─────────────────────────────────────────────────────

// vue-datepicker range mode: v-model is [Date, Date] | null
const calendarRange = ref<Date[] | null>(null)

watch(calendarRange, (val) => {
  if (!val || val.length < 2)
    return
  const [rawStart, rawEnd] = val
  if (!rawStart || !rawEnd)
    return
  // same day clicked twice - expand to full day
  let start = rawStart
  let end = rawEnd
  if (rawStart.toDateString() === rawEnd.toDateString() && rawStart.getTime() === rawEnd.getTime()) {
    start = new Date(rawStart)
    start.setHours(0, 0, 0, 0)
    end = new Date(rawEnd)
    end.setHours(23, 59, 59, 999)
  }
  applyWindow(start, end)
  // check if it matches a preset
  const duration = end.getTime() - start.getTime()
  const matched = METRICS_PERIOD_OPTIONS.find((opt) => {
    const config = PERIOD_CONFIGS[opt.value]
    return Math.abs(duration - config.hours * 60 * 60 * 1000) < 60 * 1000
  })
  if (matched) {
    selectionMode.value = 'period'
    activePeriod.value = matched.value
  }
  else {
    selectionMode.value = 'calendar'
  }
})

// ── Derived timestamps ────────────────────────────────────────────────────────

const dataMin = computed<number | null>(() => {
  const first = metricsOverview.value[0]
  return first ? new Date(first.capturedAt).getTime() : null
})

const dataMax = computed<number | null>(() => {
  const last = metricsOverview.value[metricsOverview.value.length - 1]
  return last ? new Date(last.capturedAt).getTime() : null
})

watch(dataMin, (min) => {
  if (min !== null && brushStart.value === null)
    applyPeriod(activePeriod.value)
})

// ── Active period matching ────────────────────────────────────────────────────

const MATCH_TOLERANCE_MS = 60 * 1000
const matchedPeriod = computed<MetricsPeriod | null>(() => {
  const a = brushStart.value
  const b = brushEnd.value
  if (a === null || b === null)
    return activePeriod.value
  const winDuration = Math.abs(b - a)
  for (const opt of METRICS_PERIOD_OPTIONS) {
    const config = PERIOD_CONFIGS[opt.value]
    if (Math.abs(winDuration - config.hours * 60 * 60 * 1000) < MATCH_TOLERANCE_MS)
      return opt.value
  }
  return null
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function xToTimestamp(x: number, canvasWidth: number): number {
  const min = dataMin.value
  const max = dataMax.value
  if (min === null || max === null)
    return 0
  return min + (x / canvasWidth) * (max - min)
}

function timestampToX(ts: number, canvasWidth: number): number {
  const min = dataMin.value
  const max = dataMax.value
  if (min === null || max === null || max === min)
    return 0
  return ((ts - min) / (max - min)) * canvasWidth
}

// ── Drawing ───────────────────────────────────────────────────────────────────

const activeSeries = computed(() => ALL_SERIES.filter(s => props.series.includes(s.key)))

function draw() {
  const canvas = canvasRef.value
  if (!canvas)
    return
  const ctx = canvas.getContext('2d')
  if (!ctx)
    return

  const entries: MetricsHistoryEntry[] = metricsOverview.value
  const W = canvas.width
  const H = canvas.height

  const colorBg = getCSSVariable('--color-bg-card')
  const colorGap = getCSSVariable('--color-border')
  const colorAccent = props.color ?? getCSSVariable('--color-accent')
  const paletteColors = [
    getCSSVariable('--color-text-blue') || '#5b9bd5',
    getCSSVariable('--color-text-green') || '#6bbf74',
    getCSSVariable('--color-text-red') || '#d95f5f',
    getCSSVariable('--color-text-yellow') || '#d4a72c',
    getCSSVariable('--color-accent') || '#6bbf74',
  ]

  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = colorBg
  ctx.fillRect(0, 0, W, H)

  if (!entries.length)
    return

  const active = activeSeries.value

  // When scoped to a specific game, override the entry value lookup
  function getEntryValue(entry: MetricsHistoryEntry, key: SeriesKey): number | null {
    if (props.gameId !== undefined && (key === 'usersGameActivity'))
      return entry.usersByGame?.[String(props.gameId)] ?? null
    if (props.steamGameId !== undefined && (key === 'usersSteamGameActivity'))
      return entry.usersBySteamGame?.[String(props.steamGameId)] ?? null
    if (props.serverId !== undefined && key === 'gameserversPlayers')
      return entry.gameserversByServer?.[String(props.serverId)] ?? null
    if (props.serverName !== undefined && key === 'teamspeakOnline')
      return entry.teamspeakByServer?.[props.serverName] ?? null
    return entry[key] as number | null
  }

  // Per-series max for independent normalization
  const seriesMax = Object.fromEntries(
    active.map(s => [
      s.key,
      entries.reduce((m, e) => Math.max(m, getEntryValue(e, s.key) ?? 0), 1),
    ]),
  )

  const min = dataMin.value
  const max = dataMax.value
  if (min === null || max === null)
    return

  const bucketMs = max > min ? (max - min) / (entries.length - 1 || 1) : 1
  const bucketPx = (bucketMs / (max - min)) * W
  const totalBw = Math.max(bucketPx - 1, 1)
  const numSeries = active.length
  const bw = totalBw / numSeries

  // Draw gap indicators first
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (!entry)
      continue
    const ts = new Date(entry.capturedAt).getTime()
    const x = ((ts - min) / (max - min)) * W
    if (active.every(s => getEntryValue(entry, s.key) === null)) {
      ctx.globalAlpha = 1
      ctx.fillStyle = colorGap
      ctx.fillRect(x, 0, totalBw, H)
    }
  }

  for (let si = 0; si < active.length; si++) {
    const s = active[si]!
    const sMax = seriesMax[s.key] ?? 1
    const color = active.length === 1 ? colorAccent : (paletteColors[s.paletteIndex] ?? '#888')
    ctx.globalAlpha = 0.9
    ctx.fillStyle = color

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      if (!entry || getEntryValue(entry, s.key) === null)
        continue
      const v = getEntryValue(entry, s.key) ?? 0
      if (v <= 0)
        continue
      const ts = new Date(entry.capturedAt).getTime()
      const x = ((ts - min) / (max - min)) * W + si * bw
      const barH = Math.max((v / sMax) * H, 1)
      ctx.fillRect(x, H - barH, bw, barH)
    }
  }

  ctx.globalAlpha = 1

  const bStart = brushStart.value
  const bEnd = brushEnd.value

  if (bStart !== null && bEnd !== null) {
    const xA = timestampToX(Math.min(bStart, bEnd), W)
    const xB = timestampToX(Math.max(bStart, bEnd), W)

    ctx.fillStyle = theme.value === 'dark' ? 'rgba(0,0,0,0.45)' : 'rgba(200,200,200,0.65)'
    ctx.fillRect(0, 0, xA, H)
    ctx.fillRect(xB, 0, W - xB, H)

    ctx.fillStyle = colorAccent
    ctx.globalAlpha = 0.18
    ctx.fillRect(xA, 0, xB - xA, H)
    ctx.globalAlpha = 1

    ctx.strokeStyle = colorAccent
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(xA, 0)
    ctx.lineTo(xA, H)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(xB, 0)
    ctx.lineTo(xB, H)
    ctx.stroke()
  }

  const hx = hoverX.value
  if (hx !== null && !isDragging.value) {
    ctx.strokeStyle = colorAccent
    ctx.lineWidth = 1
    ctx.globalAlpha = 0.7
    ctx.beginPath()
    ctx.moveTo(hx, 0)
    ctx.lineTo(hx, H)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
}

watch([wrapperWidth, metricsOverview, brushStart, brushEnd, theme, hoverX], () => {
  const canvas = canvasRef.value
  if (!canvas)
    return
  const w = wrapperWidth.value
  if (w > 0)
    canvas.width = w
  canvas.height = CANVAS_HEIGHT
  draw()
}, { flush: 'post' })

// ── Mouse events ──────────────────────────────────────────────────────────────

function getCanvasX(clientX: number): number {
  const canvas = canvasRef.value
  if (!canvas)
    return 0
  const rect = canvas.getBoundingClientRect()
  return Math.max(0, Math.min(clientX - rect.left, canvas.width))
}

function onMouseDown(e: MouseEvent) {
  isDragging.value = true
  const ts = xToTimestamp(getCanvasX(e.clientX), canvasRef.value?.width ?? 1)
  brushStart.value = ts
  brushEnd.value = ts
}

function onMouseMove(e: MouseEvent) {
  const x = getCanvasX(e.clientX)
  hoverX.value = x
  hoverTimestamp.value = xToTimestamp(x, canvasRef.value?.width ?? 1)
  if (!isDragging.value)
    return
  brushEnd.value = hoverTimestamp.value
}

function onTouchStart(e: TouchEvent) {
  e.preventDefault()
  const touch = e.touches[0]
  if (!touch)
    return
  isDragging.value = true
  const x = getCanvasX(touch.clientX)
  const ts = xToTimestamp(x, canvasRef.value?.width ?? 1)
  brushStart.value = ts
  brushEnd.value = ts
  hoverX.value = x
}

function onTouchMove(e: TouchEvent) {
  e.preventDefault()
  const touch = e.touches[0]
  if (!touch || !isDragging.value)
    return
  const x = getCanvasX(touch.clientX)
  hoverX.value = x
  brushEnd.value = xToTimestamp(x, canvasRef.value?.width ?? 1)
}

function onTouchEnd(e: TouchEvent) {
  e.preventDefault()
  hoverX.value = null
  finishDrag()
}

function finishDrag() {
  if (!isDragging.value)
    return
  isDragging.value = false
  const bStart = brushStart.value
  const bEnd = brushEnd.value
  if (bStart === null || bEnd === null)
    return
  const start = new Date(Math.min(bStart, bEnd))
  const end = new Date(Math.max(bStart, bEnd))
  const matched = matchedPeriod.value
  if (matched) {
    selectionMode.value = 'period'
    activePeriod.value = matched
  }
  else {
    selectionMode.value = 'brush'
  }
  if (start.getTime() !== end.getTime())
    emit('change', { start, end })
}

// ── Labels ────────────────────────────────────────────────────────────────────

const startMs = computed(() => {
  const a = brushStart.value
  const b = brushEnd.value
  return a !== null && b !== null ? Math.min(a, b) : null
})

const endMs = computed(() => {
  const a = brushStart.value
  const b = brushEnd.value
  return a !== null && b !== null ? Math.max(a, b) : null
})

// Relative label - shown in footer
const startLabel = computed(() => {
  return startMs.value !== null ? formatTimestamp(startMs.value) : ''
})

const endLabel = computed(() => {
  if (endMs.value === null)
    return ''
  return Date.now() - endMs.value < 5 * 60 * 1000 ? 'Now' : formatTimestamp(endMs.value)
})

// ── Public API ────────────────────────────────────────────────────────────────

function setBrush(start: Date, end: Date) {
  brushStart.value = start.getTime()
  brushEnd.value = end.getTime()
}

onMounted(() => {
  fetchMetricsOverview()
  if (props.initialWindow) {
    applyWindow(props.initialWindow.start, props.initialWindow.end)
    selectionMode.value = 'brush'
  }
  else {
    applyPeriod(props.initialPeriod ?? activePeriod.value)
  }
})

defineExpose({ setBrush })
</script>

<template>
  <div ref="wrapperRef" class="chart-brush">
    <div class="chart-brush__canvas-wrapper">
      <canvas
        ref="canvasRef"
        class="chart-brush__canvas"
        :height="CANVAS_HEIGHT"
        @mousedown="onMouseDown"
        @mousemove="onMouseMove"
        @mouseup="finishDrag"
        @mouseleave="hoverX = null; hoverTimestamp = null; finishDrag()"
        @touchstart="onTouchStart"
        @touchmove="onTouchMove"
        @touchend="onTouchEnd"
        @touchcancel="onTouchEnd"
      />
      <div
        v-if="hoverTimestamp !== null && !isDragging"
        class="chart-brush__hover-tooltip"
        :style="{ left: `${hoverX}px` }"
      >
        {{ formatTimestamp(hoverTimestamp) }}
      </div>
    </div>
    <Flex x-between y-center class="chart-brush__footer">
      <span class="chart-brush__range">{{ startLabel }}{{ endLabel ? ` - ${endLabel}` : '' }}</span>

      <Flex gap="xs" y-center>
        <ButtonGroup>
          <Button
            :variant="!useUtc ? 'fill' : 'gray'"
            @click="useUtc = false"
          >
            Local
          </Button>
          <Button
            :variant="useUtc ? 'fill' : 'gray'"
            @click="useUtc = true"
          >
            UTC
          </Button>
        </ButtonGroup>

        <ButtonGroup>
          <Dropdown placement="bottom-end">
            <template #trigger="{ toggle, isOpen: dropdownOpen }">
              <Button
                :variant="selectionMode === 'period' ? 'fill' : 'gray'"
                @click="toggle"
              >
                {{ selectionMode === 'calendar' || selectionMode === 'brush' ? 'Custom' : (matchedPeriod ? METRICS_PERIOD_OPTIONS.find(o => o.value === matchedPeriod)?.label : 'Custom') }}
                <template #end>
                  <Icon :name="dropdownOpen ? 'ph:caret-up' : 'ph:caret-down'" :size="12" />
                </template>
              </Button>
            </template>

            <DropdownItem
              v-for="opt in METRICS_PERIOD_OPTIONS"
              :key="opt.value"
              @click="applyPeriod(opt.value)"
            >
              {{ opt.label }}
            </DropdownItem>
          </Dropdown>

          <Calendar
            v-model="calendarRange"
            :range="true"
            :enable-time-picker="true"
            :max-date="new Date()"
            :teleport="true"
          >
            <template #trigger>
              <Tooltip placement="top">
                <Button square :variant="selectionMode === 'calendar' ? 'fill' : 'gray'">
                  <Icon name="ph:calendar-dots" />
                </Button>
                <template #tooltip>
                  <p>Pick exact range</p>
                </template>
              </Tooltip>
            </template>
          </Calendar>
        </ButtonGroup>
      </Flex>
    </Flex>
  </div>
</template>

<style scoped lang="scss">
.chart-brush {
  width: 100%;
  isolation: isolate;

  &__canvas-wrapper {
    position: relative;
    width: 100%;
  }

  &__hover-tooltip {
    position: absolute;
    top: 4px;
    transform: translateX(-50%);
    pointer-events: none;
    background: var(--color-bg-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-s);
    padding: 2px var(--space-xs);
    font-size: var(--font-size-xxs);
    color: var(--color-text-light);
    white-space: nowrap;
    z-index: var(--z-popout);
  }

  &__canvas {
    display: block;
    width: 100%;
    height: 56px;
    cursor: crosshair;
    border-radius: var(--border-radius-s);
    background-color: var(--color-bg-card);
  }

  &__footer {
    margin-top: var(--space-xs);
  }

  &__range {
    color: var(--color-text-lighter);
    font-size: var(--font-size-xs);
    cursor: default;

    @media (max-width: #{$breakpoint-xs}) {
      display: none;
    }
  }
}
</style>
