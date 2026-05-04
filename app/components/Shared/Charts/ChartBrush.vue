<script setup lang="ts">
import type { MetricsHistoryEntry, MetricsPeriod } from '@/composables/useDataMetrics'
import { Button, Calendar, Flex, theme, Tooltip } from '@dolanske/vui'
import { useElementSize } from '@vueuse/core'
import { computed, onMounted, ref, watch } from 'vue'
import { METRICS_PERIOD_OPTIONS, PERIOD_CONFIGS, useDataMetrics } from '@/composables/useDataMetrics'
import { getCSSVariable } from '@/lib/utils/common'

type SeriesKey = 'membersOnline' | 'teamspeakOnline' | 'gameserversPlayers'

interface SeriesDef {
  key: SeriesKey
  label: string
  paletteIndex: number
}

const props = withDefaults(defineProps<{
  series?: SeriesKey[]
}>(), {
  series: () => ['membersOnline', 'teamspeakOnline', 'gameserversPlayers'] as SeriesKey[],
})

const emit = defineEmits<{
  'change': [{ start: Date, end: Date }]
  'update:utc': [boolean]
}>()

const ALL_SERIES: SeriesDef[] = [
  { key: 'membersOnline', label: 'Users', paletteIndex: 1 },
  { key: 'teamspeakOnline', label: 'TeamSpeak', paletteIndex: 0 },
  { key: 'gameserversPlayers', label: 'Servers', paletteIndex: 3 },
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

// ── Period chips ──────────────────────────────────────────────────────────────

const activePeriod = ref<MetricsPeriod>('24h')

function applyWindow(start: Date, end: Date) {
  brushStart.value = start.getTime()
  brushEnd.value = end.getTime()
  emit('change', { start, end })
}

function applyPeriod(period: MetricsPeriod) {
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
  const [start, end] = val
  if (!start || !end)
    return
  applyWindow(start, end)
  // check if it matches a preset
  const duration = end.getTime() - start.getTime()
  const matched = METRICS_PERIOD_OPTIONS.find((opt) => {
    const config = PERIOD_CONFIGS[opt.value]
    return Math.abs(duration - config.hours * 60 * 60 * 1000) < 60 * 1000
  })
  activePeriod.value = matched?.value ?? activePeriod.value
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

  const colorBg = getCSSVariable('--color-bg-lowered')
  const colorGap = getCSSVariable('--color-bg-raised')
  const colorAccent = getCSSVariable('--color-accent')
  const paletteColors = [
    getCSSVariable('--color-text-blue'),
    getCSSVariable('--color-text-green'),
    getCSSVariable('--color-text-red'),
    getCSSVariable('--color-text-yellow'),
  ]

  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = colorBg
  ctx.fillRect(0, 0, W, H)

  if (!entries.length)
    return

  const active = activeSeries.value

  // Per-series max for independent normalization
  const seriesMax = Object.fromEntries(
    active.map(s => [
      s.key,
      entries.reduce((m, e) => Math.max(m, e[s.key] ?? 0), 1),
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
    if (active.every(s => entry[s.key] === null)) {
      ctx.globalAlpha = 1
      ctx.fillStyle = colorGap
      ctx.fillRect(x, 0, totalBw, H)
    }
  }

  for (let si = 0; si < active.length; si++) {
    const s = active[si]!
    const sMax = seriesMax[s.key] ?? 1
    const color = paletteColors[s.paletteIndex] ?? '#888'
    ctx.globalAlpha = 0.9
    ctx.fillStyle = color

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      if (!entry || entry[s.key] === null)
        continue
      const v = entry[s.key] ?? 0
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

function getCanvasX(e: MouseEvent): number {
  const canvas = canvasRef.value
  if (!canvas)
    return 0
  const rect = canvas.getBoundingClientRect()
  return Math.max(0, Math.min(e.clientX - rect.left, canvas.width))
}

function onMouseDown(e: MouseEvent) {
  isDragging.value = true
  const ts = xToTimestamp(getCanvasX(e), canvasRef.value?.width ?? 1)
  brushStart.value = ts
  brushEnd.value = ts
}

function onMouseMove(e: MouseEvent) {
  hoverX.value = getCanvasX(e)
  if (!isDragging.value)
    return
  brushEnd.value = xToTimestamp(getCanvasX(e), canvasRef.value?.width ?? 1)
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
  if (matched)
    activePeriod.value = matched
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
  applyPeriod('24h')
})

defineExpose({ setBrush })
</script>

<template>
  <div ref="wrapperRef" class="chart-brush">
    <canvas
      ref="canvasRef"
      class="chart-brush__canvas"
      :height="CANVAS_HEIGHT"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="finishDrag"
      @mouseleave="hoverX = null; finishDrag()"
    />
    <Flex x-between y-center class="chart-brush__footer">
      <span class="chart-brush__range">{{ startLabel }}{{ endLabel ? ` - ${endLabel}` : '' }}</span>

      <Flex gap="xs" y-center>
        <Button
          v-for="opt in METRICS_PERIOD_OPTIONS"
          :key="opt.value"
          :variant="matchedPeriod === opt.value ? 'fill' : 'gray'"
          @click="applyPeriod(opt.value)"
        >
          {{ opt.label }}
        </Button>

        <Tooltip placement="top">
          <Button
            square
            :variant="useUtc ? 'fill' : 'gray'"
            @click="useUtc = !useUtc"
          >
            UTC
          </Button>
          <template #tooltip>
            <p>{{ useUtc ? 'Showing UTC times' : 'Showing local times' }}</p>
          </template>
        </Tooltip>

        <Calendar
          v-model="calendarRange"
          :range="true"
          :enable-time-picker="true"
          :max-date="new Date()"
        >
          <template #trigger>
            <Tooltip placement="top">
              <Button square variant="gray">
                <Icon name="ph:calendar-dots" />
              </Button>
              <template #tooltip>
                <p>Pick exact range</p>
              </template>
            </Tooltip>
          </template>
        </Calendar>
      </Flex>
    </Flex>
  </div>
</template>

<style scoped lang="scss">
.chart-brush {
  width: 100%;

  &__canvas {
    display: block;
    width: 100%;
    height: 56px;
    cursor: crosshair;
    border-radius: var(--border-radius-s);
    background-color: var(--color-bg-lowered);
  }

  &__footer {
    margin-top: var(--space-xs);
  }

  &__range {
    color: var(--color-text-lighter);
    font-size: var(--font-size-xs);
    cursor: default;
  }
}
</style>
