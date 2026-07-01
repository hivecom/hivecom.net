<script setup lang="ts">
import type { WaveformData } from '@/lib/audio/waveform'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { computeWaveform } from '@/lib/audio/waveform'
import { formatClock } from '@/lib/utils/duration'

// The SoundCloud-style waveform for the fullscreen player. Decodes the file once
// (off the playback element, see lib/audio/decode), buckets it into bars and
// paints them mirrored around the center line. It's a static timeline: played
// bars sit in the accent, the rest as a dim ghost, with a playhead that tracks
// progress. The whole strip seeks on click/drag and previews on hover. The live,
// music-reactive piece lives in AudioSpectrum, kept separate on purpose.

const props = defineProps<{
  // Track URL. Swapping it recomputes the waveform.
  src: string
  // Playback position as a 0..1 fraction of the duration, for the playhead.
  progress: number
  // Total duration in seconds, used to turn a click position into a seek time.
  duration: number
}>()

const emit = defineEmits<{
  // A scrub target in seconds.
  seek: [time: number]
  // Pointer pressed/released, so the parent can hold timeupdate off mid-drag.
  seekStart: []
  seekEnd: []
}>()

type Status = 'loading' | 'ready' | 'error'
const status = ref<Status>('loading')
const waveform = ref<WaveformData | null>(null)

const canvas = ref<HTMLCanvasElement | null>(null)
const wrap = ref<HTMLElement | null>(null)

let resizeObserver: ResizeObserver | null = null

// Live pointer position as a 0..1 fraction while hovering, null otherwise.
const hoverFraction = ref<number | null>(null)

// Read the live accent so the bars track the active theme.
function readAccent(): [number, number, number] {
  return readThemeColor('--color-accent', [167, 252, 47])
}

let accent: [number, number, number] = [167, 252, 47]

// Re-read the accent and repaint when the theme flips, the way the globe does.
onThemeChange(() => {
  accent = readAccent()
  repaint()
})

// Geometry constants. Bars are a few px wide with a hairline gap; the canvas
// fits as many as the width allows and samples the analysis grid down to match.
const BAR_WIDTH = 3
const BAR_GAP = 2
const MIN_BAR = 2

// Sample the analysis peaks down to `count` display bars, taking the loudest
// source bar in each bucket so transients survive the downsample.
function resample(peaks: Float32Array, count: number): Float32Array {
  const out = new Float32Array(count)
  const per = peaks.length / count
  for (let i = 0; i < count; i++) {
    const from = Math.floor(i * per)
    const to = Math.max(from + 1, Math.floor((i + 1) * per))
    let peak = 0
    for (let k = from; k < to && k < peaks.length; k++) {
      if (peaks[k]! > peak)
        peak = peaks[k]!
    }
    out[i] = peak
  }
  return out
}

let displayBars: Float32Array = new Float32Array(0)

function rebuildBars() {
  const host = wrap.value
  const data = waveform.value
  if (!host || !data)
    return
  const count = Math.max(1, Math.floor(host.clientWidth / (BAR_WIDTH + BAR_GAP)))
  displayBars = resample(data.peaks, count)
}

function draw() {
  const cv = canvas.value
  const host = wrap.value
  if (!cv || !host || status.value !== 'ready')
    return

  const w = host.clientWidth
  const h = host.clientHeight
  if (w === 0 || h === 0)
    return

  const dpr = resizeCanvasToDisplay(cv, w, h)

  const ctx = cv.getContext('2d')
  if (!ctx)
    return

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const count = displayBars.length
  if (count === 0)
    return

  const step = w / count
  const centerY = h / 2
  const maxBar = h * 0.46
  const progress = Math.max(0, Math.min(1, props.progress))
  const headX = progress * w
  const hover = hoverFraction.value
  const hoverX = hover == null ? -1 : hover * w

  const [ar, ag, ab] = accent

  for (let i = 0; i < count; i++) {
    const x = i * step
    const barH = Math.max(MIN_BAR, displayBars[i]! * maxBar)
    const mid = x + step * 0.5
    const played = mid <= headX
    const hovered = hoverX >= 0 && mid <= hoverX

    if (played) {
      ctx.fillStyle = `rgb(${ar}, ${ag}, ${ab})`
    }
    else if (hovered) {
      // Lighten the not-yet-played bars up to the cursor, the SoundCloud preview.
      ctx.fillStyle = `rgba(${ar}, ${ag}, ${ab}, 0.5)`
    }
    else {
      ctx.fillStyle = `rgba(${ar}, ${ag}, ${ab}, 0.2)`
    }

    ctx.fillRect(x, centerY - barH, BAR_WIDTH, barH * 2)
  }

  // The playhead line.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.fillRect(headX - 1, 0, 2, h)

  // Hover marker.
  if (hoverX >= 0) {
    ctx.fillStyle = `rgba(${ar}, ${ag}, ${ab}, 0.6)`
    ctx.fillRect(hoverX - 0.5, 0, 1, h)
  }
}

// Coalesce repaints into one frame so a burst of prop changes paints once.
let repaintQueued = false
function repaint() {
  if (status.value !== 'ready' || repaintQueued)
    return
  repaintQueued = true
  requestAnimationFrame(() => {
    repaintQueued = false
    draw()
  })
}

async function load() {
  status.value = 'loading'
  waveform.value = null
  displayBars = new Float32Array(0)
  const src = props.src
  try {
    const data = await computeWaveform(src)
    // Bail if the src changed while we were decoding.
    if (src !== props.src)
      return
    accent = readAccent()
    waveform.value = data
    status.value = 'ready'
    rebuildBars()
    repaint()
  }
  catch {
    if (src === props.src)
      status.value = 'error'
  }
}

watch(() => props.src, load, { immediate: true })

// Move the playhead as playback (or a paused scrub) advances.
watch(() => props.progress, repaint)

// Turn a pointer x into a 0..1 fraction along the strip.
function fractionFromEvent(event: PointerEvent): number | null {
  const host = wrap.value
  if (!host)
    return null
  const rect = host.getBoundingClientRect()
  return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
}

let dragging = false

function onPointerDown(event: PointerEvent) {
  if (status.value !== 'ready' || !props.duration)
    return
  dragging = true
  emit('seekStart')
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  const f = fractionFromEvent(event)
  if (f != null)
    emit('seek', f * props.duration)
}

function onPointerMove(event: PointerEvent) {
  const f = fractionFromEvent(event)
  hoverFraction.value = f
  if (dragging && f != null)
    emit('seek', f * props.duration)
  repaint()
}

function onPointerUp(event: PointerEvent) {
  if (dragging) {
    dragging = false
    const f = fractionFromEvent(event)
    if (f != null)
      emit('seek', f * props.duration)
    emit('seekEnd')
    ;(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId)
  }
}

function onPointerLeave() {
  hoverFraction.value = null
  repaint()
}

// Hover time label, anchored to the cursor.
const hoverTime = computed(() => {
  if (hoverFraction.value == null || !props.duration)
    return null
  return formatClock(hoverFraction.value * props.duration)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

// Re-bucket the bars and repaint on container resize.
watch(wrap, (el) => {
  resizeObserver?.disconnect()
  if (!el)
    return
  resizeObserver = new ResizeObserver(() => {
    rebuildBars()
    repaint()
  })
  resizeObserver.observe(el)
})
</script>

<template>
  <div
    ref="wrap"
    class="audio-waveform"
    :class="{ 'audio-waveform--interactive': status === 'ready' && duration > 0 }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @pointerleave="onPointerLeave"
  >
    <canvas ref="canvas" class="audio-waveform__canvas" />

    <div
      v-if="hoverTime && status === 'ready'"
      class="audio-waveform__tip text-xs"
      :style="{ left: `${(hoverFraction ?? 0) * 100}%` }"
    >
      {{ hoverTime }}
    </div>

    <div v-if="status === 'loading'" class="audio-waveform__state text-s text-color-lighter">
      <Icon name="ph:waveform" :size="20" />
      <span>Analyzing audio...</span>
    </div>

    <div v-else-if="status === 'error'" class="audio-waveform__state text-s text-color-lighter">
      <Icon name="ph:waveform-slash" :size="20" />
      <span>Waveform unavailable for this track.</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.audio-waveform {
  position: relative;
  width: 100%;
  height: 100%;
  user-select: none;
  touch-action: none;

  &--interactive {
    cursor: pointer;
  }

  &__canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  &__tip {
    position: absolute;
    top: var(--space-xs);
    transform: translateX(-50%);
    padding: 2px 6px;
    border-radius: var(--border-radius-s);
    background: var(--color-bg-lowered);
    color: var(--color-text);
    font-variant-numeric: tabular-nums;
    pointer-events: none;
    white-space: nowrap;
  }

  &__state {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs);
    text-align: center;
    padding: var(--space-m);
  }
}
</style>
