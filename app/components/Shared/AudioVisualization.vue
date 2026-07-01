<script setup lang="ts">
import type { AudioFeatures } from '@/lib/audio/features'
import type { SmokeColors, SmokeField } from '@/lib/audio/smoke-field'
import { onBeforeUnmount, ref, watch } from 'vue'
import { decodeAudio } from '@/lib/audio/decode'
import { FeatureAnalyzer } from '@/lib/audio/features'

// The fullscreen-player smoke visualizer. Same data contract as AudioSpectrum
// (decode once, window an FFT at the playhead each frame) but instead of bars it
// drives a 3D feedback-buffer smoke field: bass hits blast splotches and kick
// the camera, high hits flash ghost geometry, calm passages draw slow lines.
// The heavy lifting lives in lib/audio/smoke-field (Three, loaded client-side
// only); this component just feeds it features and runs the loop. If WebGL or
// the decode is unavailable it degrades to an empty panel, audio untouched.

const props = defineProps<{
  // Track URL. Swapping it re-decodes.
  src: string
  // Playback position as a 0..1 fraction, where we window the FFT.
  progress: number
  // Total duration in seconds, used to extrapolate the playhead between the
  // ~4Hz progress updates.
  duration: number
  // Whether the engine is playing, so the analysis loop only runs then.
  playing: boolean
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const wrap = ref<HTMLElement | null>(null)

const analyzer = new FeatureAnalyzer()
let samples: Float32Array | null = null
let sampleCount = 0
let engine: SmokeField | null = null
let engineLoading = false

let lastNow = 0
// Keep rendering for a moment after playback stops so the smoke dissolves
// instead of freezing mid-wisp, then park the loop.
let coastUntil = 0
const COAST_MS = 2600

// What we feed the engine when nothing is playing: everything calm so the field
// settles and fades.
const IDLE: AudioFeatures = {
  energy: 0,
  level: 0,
  bands: { sub: 0, bass: 0, lowMid: 0, mid: 0, high: 0, air: 0 },
  onset: 0,
  bassHit: 0,
  highHit: 0,
  brightness: 0.5,
  flow: 0,
  splatter: 0,
  geometry: 0,
}

let lastTrackedSec = 0

// Smooth playhead between the ~4Hz progress updates. Same extrapolation
// AudioSpectrum runs.
const playhead = usePlayhead(props)

// Pull the VUI theme tokens the visualizer maps onto: background, bright accent,
// and the slightly darker background the cutouts dig toward. The engine wants
// 0..1, so read them normalized.
function readColors(): SmokeColors {
  return {
    bg: readThemeColor('--color-bg', [0.067, 0.067, 0.067], { normalized: true }),
    accent: readThemeColor('--color-accent', [0.65, 0.99, 0.18], { normalized: true }),
    dark: readThemeColor('--color-bg-lowered', [0.047, 0.047, 0.047], { normalized: true }),
  }
}

const { start: startLoop, stop: stopLoop } = useCanvasLoop((now) => {
  const host = wrap.value
  if (!engine || !host)
    return false

  const dt = lastNow ? (now - lastNow) / 1000 : 1 / 60
  lastNow = now

  const w = host.clientWidth
  const h = host.clientHeight
  if (w > 0 && h > 0)
    engine.resize(w, h, Math.min(window.devicePixelRatio || 1, 2))

  // While playing, window the FFT at the extrapolated playhead and feed the live
  // features; otherwise coast on the idle (fading) state.
  let features = IDLE
  if (props.playing && samples && sampleCount > 0 && props.duration > 0) {
    const head = playhead.at(now)
    const sec = head * props.duration
    // A backward or large jump in the playhead is a seek; drop the flux history
    // so it doesn't read as one giant fake onset.
    if (Math.abs(sec - lastTrackedSec) > 0.5)
      analyzer.reset()
    lastTrackedSec = sec
    features = analyzer.analyze(Math.floor(head * sampleCount))
  }

  engine.frame(features, dt, now / 1000)

  // Keep going while playing or until the coast window dissolves the smoke.
  return props.playing || now < coastUntil
})

// Build the WebGL engine once the canvas is in the DOM. Null means no WebGL, so
// the panel just stays dark.
async function ensureEngine() {
  if (engine || engineLoading || !import.meta.client)
    return
  const el = canvas.value
  if (!el)
    return
  engineLoading = true
  try {
    const { SmokeField } = await import('@/lib/audio/smoke-field')
    if (el !== canvas.value)
      return
    engine = await SmokeField.create(el, readColors())
  }
  finally {
    engineLoading = false
  }
}

async function load() {
  samples = null
  sampleCount = 0
  const src = props.src
  try {
    const buffer = await decodeAudio(src)
    if (src !== props.src)
      return
    samples = buffer.getChannelData(0)
    sampleCount = buffer.length
    analyzer.setSamples(samples, sampleCount, buffer.sampleRate)
    if (props.playing)
      startLoop()
  }
  catch {
    // No audio (e.g. cross-origin without CORS). The field just idles.
    samples = null
  }
}

watch(() => props.src, load, { immediate: true })

// Start on play; on pause set the coast window so the smoke dissolves, then the
// loop parks itself.
watch(() => props.playing, (playing) => {
  if (playing) {
    analyzer.reset()
    coastUntil = 0
    startLoop()
  }
  else if (import.meta.client) {
    coastUntil = performance.now() + COAST_MS
    startLoop()
  }
})

let resizeObserver: ResizeObserver | null = null

// Re-read the palette and repaint when the theme flips, the way the globe does.
onThemeChange(() => {
  engine?.setColors(readColors())
  startLoop()
})

watch(canvas, async (el) => {
  if (!el)
    return
  await ensureEngine()
  resizeObserver?.disconnect()
  if (import.meta.client && 'ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(() => startLoop())
    resizeObserver.observe(el)
  }
  // Render at least one frame so the field is visible before playback starts.
  startLoop()
})

onBeforeUnmount(() => {
  stopLoop()
  resizeObserver?.disconnect()
  engine?.dispose()
  engine = null
})
</script>

<template>
  <div ref="wrap" class="audio-visualization">
    <canvas ref="canvas" class="audio-visualization__canvas" />
  </div>
</template>

<style scoped lang="scss">
.audio-visualization {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--color-bg);
  border-radius: var(--border-radius-m);

  &__canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
}
</style>
