<script setup lang="ts">
import type { SpectrogramData } from '@/lib/audio/spectrogram'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { computeSpectrogram } from '@/lib/audio/spectrogram'

// The full-track spectrogram for the fullscreen player. Decodes the file once
// (off the playback element, see lib/audio/spectrogram), paints it to a canvas
// and lays a playhead over it. The whole strip is the timeline: clicking or
// dragging anywhere seeks.

const props = defineProps<{
  // Track URL. Swapping it recomputes the heatmap.
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
const grid = ref<SpectrogramData | null>(null)

const canvas = ref<HTMLCanvasElement | null>(null)
const wrap = ref<HTMLElement | null>(null)

// Offscreen buffer holds the raw columns x bins image; the visible canvas just
// stretches it, so a resize never recomputes the FFT.
let offscreen: HTMLCanvasElement | null = null
let resizeObserver: ResizeObserver | null = null

// Read the live accent so the heatmap tracks the active theme.
function readAccent(): [number, number, number] {
  if (!import.meta.client)
    return [167, 252, 47]
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim()
  const hex = raw.match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const n = Number.parseInt(hex[1]!, 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const rgb = raw.match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/)
  if (rgb)
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  return [167, 252, 47]
}

// Ramp from black up through the accent and out to white. Low energy stays dark
// so the loud content reads as bright accent streaks.
function colorFor(t: number, accent: [number, number, number]): [number, number, number] {
  if (t <= 0)
    return [0, 0, 0]
  if (t < 0.6) {
    const k = t / 0.6
    return [accent[0] * k, accent[1] * k, accent[2] * k]
  }
  const k = (t - 0.6) / 0.4
  return [
    accent[0] + (255 - accent[0]) * k,
    accent[1] + (255 - accent[1]) * k,
    accent[2] + (255 - accent[2]) * k,
  ]
}

function buildOffscreen(data: SpectrogramData) {
  const { data: cells, columns, bins } = data
  const off = document.createElement('canvas')
  off.width = columns
  off.height = bins
  const ctx = off.getContext('2d')
  if (!ctx)
    return
  const img = ctx.createImageData(columns, bins)
  const accent = readAccent()
  for (let col = 0; col < columns; col++) {
    for (let b = 0; b < bins; b++) {
      // Low frequencies (b = 0) belong at the bottom of the image.
      const y = bins - 1 - b
      const [r, g, bl] = colorFor(cells[col * bins + b]!, accent)
      const idx = (y * columns + col) * 4
      img.data[idx] = r
      img.data[idx + 1] = g
      img.data[idx + 2] = bl
      img.data[idx + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  offscreen = off
}

// Stretch the offscreen image into the visible canvas at device resolution.
function paint() {
  const cv = canvas.value
  const host = wrap.value
  if (!cv || !host || !offscreen)
    return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = host.clientWidth
  const h = host.clientHeight
  if (w === 0 || h === 0)
    return
  cv.width = Math.round(w * dpr)
  cv.height = Math.round(h * dpr)
  const ctx = cv.getContext('2d')
  if (!ctx)
    return
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.clearRect(0, 0, cv.width, cv.height)
  ctx.drawImage(offscreen, 0, 0, cv.width, cv.height)
}

async function load() {
  status.value = 'loading'
  grid.value = null
  offscreen = null
  const src = props.src
  try {
    const data = await computeSpectrogram(src)
    // Bail if the src changed while we were decoding.
    if (src !== props.src)
      return
    grid.value = data
    buildOffscreen(data)
    status.value = 'ready'
    paint()
  }
  catch {
    if (src === props.src)
      status.value = 'error'
  }
}

watch(() => props.src, load, { immediate: true })

const progressPercent = computed(() => `${Math.max(0, Math.min(1, props.progress)) * 100}%`)

// Turn a pointer x into a seek and report it. Used for click and drag.
function seekFromEvent(event: PointerEvent) {
  const host = wrap.value
  if (!host || !props.duration)
    return
  const rect = host.getBoundingClientRect()
  const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
  emit('seek', fraction * props.duration)
}

let dragging = false

function onPointerDown(event: PointerEvent) {
  if (status.value !== 'ready' || !props.duration)
    return
  dragging = true
  emit('seekStart')
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  seekFromEvent(event)
}

function onPointerMove(event: PointerEvent) {
  if (dragging)
    seekFromEvent(event)
}

function onPointerUp(event: PointerEvent) {
  if (!dragging)
    return
  dragging = false
  seekFromEvent(event)
  emit('seekEnd')
  ;(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId)
}

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

// Repaint on container resize once we have an image.
watch(wrap, (el) => {
  resizeObserver?.disconnect()
  if (!el)
    return
  resizeObserver = new ResizeObserver(() => paint())
  resizeObserver.observe(el)
})
</script>

<template>
  <div
    ref="wrap"
    class="audio-spectrogram"
    :class="{ 'audio-spectrogram--interactive': status === 'ready' && duration > 0 }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <canvas ref="canvas" class="audio-spectrogram__canvas" />

    <div v-if="status === 'ready'" class="audio-spectrogram__playhead" :style="{ left: progressPercent }" />

    <div v-if="status === 'loading'" class="audio-spectrogram__state text-s text-color-lighter">
      <Icon name="ph:waveform" :size="20" />
      <span>Analyzing audio...</span>
    </div>

    <div v-else-if="status === 'error'" class="audio-spectrogram__state text-s text-color-lighter">
      <Icon name="ph:waveform-slash" :size="20" />
      <span>Spectrogram unavailable for this track.</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.audio-spectrogram {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: var(--border-radius-m);
  overflow: hidden;
  background: #000;
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

  &__playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--color-text);
    box-shadow: 0 0 8px -1px var(--color-text);
    pointer-events: none;
    transform: translateX(-1px);
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
