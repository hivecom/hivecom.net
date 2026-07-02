<script setup lang="ts">
import type { AnalysisFrame, SharedAnalysis } from '@/lib/audio/analysis'
import type { SmokeColors, SmokeConfig, SmokeField } from '@/lib/audio/smoke-field'
import { Button, Card, Flex, Slider, Switch } from '@dolanske/vui'
import { onBeforeUnmount, reactive, ref, watch } from 'vue'
import { getSharedAnalysis } from '@/lib/audio/analysis'
import { DEFAULT_SMOKE_CONFIG } from '@/lib/audio/smoke-field'

// The fullscreen-player smoke visualizer. It doesn't run any FFTs of its own:
// the shared analysis provider (lib/audio/analysis) decodes the track once,
// extrapolates the playhead, and hands every panel a per-frame feature set, so
// this component just drives a 3D feedback-buffer smoke field off it. Bass hits
// blast splotches and kick the camera, high hits flash ghost geometry, calm
// passages draw slow lines. The heavy lifting lives in lib/audio/smoke-field
// (Three, loaded client-side only). If WebGL is unavailable it degrades to an
// empty panel, audio untouched.

const props = defineProps<{
  // Track URL. Swapping it re-subscribes to that track's shared analysis.
  src: string
  // Playback position as a 0..1 fraction. The provider reads playback state
  // directly, so this is only here for the shared prop shape the lightbox binds.
  progress: number
  // Total duration in seconds.
  duration: number
  // Whether the engine is playing.
  playing: boolean
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const wrap = ref<HTMLElement | null>(null)

// Debug: flip to true to show the live tuning panel over the visualization. Off by
// default so the visual is chrome-free; the config defaults are the shipped look.
const DEBUG_SETTINGS = false

// Live-tunable engine config, bound to the settings panel. The engine holds this
// same object and reads it every frame, so slider changes take effect immediately.
const config = reactive<SmokeConfig>({ ...DEFAULT_SMOKE_CONFIG })
const showSettings = ref(false)

// Slider metadata: which knobs to show, grouped, with their ranges. `shards` is a
// boolean so it renders as a switch, separately.
type NumericKey = Exclude<keyof SmokeConfig, 'shards'>
interface Control { key: NumericKey, label: string, min: number, max: number, step: number }
const CONTROL_GROUPS: { group: string, items: Control[] }[] = [
  { group: 'Camera', items: [
    { key: 'cameraDistance', label: 'Distance', min: 3, max: 12, step: 0.1 },
    { key: 'cameraDrift', label: 'Idle drift', min: 0, max: 0.2, step: 0.005 },
    { key: 'cameraAudioKick', label: 'Audio kick', min: 0, max: 1.5, step: 0.05 },
    { key: 'cameraBeatPump', label: 'Beat pump', min: 0, max: 0.6, step: 0.02 },
    { key: 'cameraSway', label: 'Sway', min: 0, max: 1.5, step: 0.05 },
  ] },
  { group: 'Motion', items: [
    { key: 'paceEnergy', label: 'Loudness pace', min: 0, max: 2, step: 0.05 },
    { key: 'tempoInfluence', label: 'Tempo influence', min: 0, max: 1, step: 0.05 },
    { key: 'flowSpeed', label: 'Flow speed', min: 0, max: 3, step: 0.05 },
  ] },
  { group: 'Smoke', items: [
    { key: 'smokePersist', label: 'Persistence', min: 0.9, max: 0.995, step: 0.001 },
    { key: 'turbulence', label: 'Turbulence', min: 0, max: 3, step: 0.05 },
    { key: 'buoyancy', label: 'Buoyancy', min: 0, max: 3, step: 0.05 },
    { key: 'smokeBlur', label: 'Diffusion', min: 0, max: 1, step: 0.05 },
    { key: 'bedDensity', label: 'Dust density', min: 0, max: 3, step: 0.05 },
    { key: 'bedSize', label: 'Dust size', min: 0.02, max: 0.6, step: 0.01 },
  ] },
  { group: 'Hits', items: [
    { key: 'bassBloomSize', label: 'Bass bloom', min: 0.2, max: 5, step: 0.1 },
    { key: 'bassPush', label: 'Bass shove', min: 0, max: 4, step: 0.1 },
    { key: 'bigFlashSize', label: 'Big flash', min: 0, max: 8, step: 0.1 },
    { key: 'bigPush', label: 'Big shove', min: 0, max: 4, step: 0.1 },
    { key: 'cutouts', label: 'Cutouts', min: 0, max: 3, step: 0.05 },
    { key: 'lines', label: 'Streak lines', min: 0, max: 3, step: 0.05 },
    { key: 'lineAccent', label: 'Line cut/accent', min: 0, max: 1, step: 0.05 },
  ] },
  { group: 'Look', items: [
    { key: 'contrast', label: 'Contrast', min: 0.2, max: 3, step: 0.05 },
    { key: 'grain', label: 'Grain', min: 0, max: 3, step: 0.05 },
    { key: 'dust', label: 'Sparkle', min: 0, max: 3, step: 0.05 },
  ] },
]

function resetConfig() {
  Object.assign(config, DEFAULT_SMOKE_CONFIG)
}

let engine: SmokeField | null = null
let engineLoading = false

let lastNow = 0

// The shared analysis this panel is subscribed to, plus its unsubscribe.
let analysis: SharedAnalysis | null = null
let unsubscribe: (() => void) | null = null

// Pull the VUI theme tokens the visualizer maps onto: background, bright accent,
// the slightly darker background the cutouts dig toward, and the foreground text
// colour the fast hits flash toward. The engine wants 0..1, so read them normalized.
function readColors(): SmokeColors {
  return {
    bg: readThemeColor('--color-bg', [0.067, 0.067, 0.067], { normalized: true }),
    accent: readThemeColor('--color-accent', [0.65, 0.99, 0.18], { normalized: true }),
    dark: readThemeColor('--color-bg-lowered', [0.047, 0.047, 0.047], { normalized: true }),
    text: readThemeColor('--color-text', [0.92, 0.92, 0.92], { normalized: true }),
  }
}

// Draw one frame from the shared analysis: resize to the panel and feed the
// engine the features the provider already computed. dt comes off the frame's
// rAF timestamp, the same as before.
function onFrame(frame: AnalysisFrame) {
  const host = wrap.value
  if (!engine || !host)
    return

  const now = frame.now
  const dt = lastNow ? (now - lastNow) / 1000 : 1 / 60
  lastNow = now

  const w = host.clientWidth
  const h = host.clientHeight
  if (w > 0 && h > 0)
    engine.resize(w, h, Math.min(window.devicePixelRatio || 1, 2))

  engine.frame(frame.features, dt, now / 1000)
}

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
    engine = await SmokeField.create(el, readColors(), config)
  }
  finally {
    engineLoading = false
  }
}

// Subscribe to the shared analysis for the current track. The provider owns the
// decode and the loop; we just get a per-frame callback while it's live.
function subscribe(src: string) {
  unsubscribe?.()
  analysis = getSharedAnalysis(src)
  unsubscribe = analysis.subscribe(onFrame)
}

watch(() => props.src, src => subscribe(src), { immediate: true })

// The provider handles coast on pause and the flux reset on resume. A play flip
// just nudges one frame so the field starts moving right away.
watch(() => props.playing, () => analysis?.requestFrame())

// Repaint when a slider moves even while paused, so tuning is visible immediately.
watch(config, () => analysis?.requestFrame(), { deep: true })

let resizeObserver: ResizeObserver | null = null

// Re-read the palette and repaint when the theme flips, the way the globe does.
onThemeChange(() => {
  engine?.setColors(readColors())
  analysis?.requestFrame()
})

watch(canvas, async (el) => {
  if (!el)
    return
  await ensureEngine()
  resizeObserver?.disconnect()
  if (import.meta.client && 'ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(() => analysis?.requestFrame())
    resizeObserver.observe(el)
  }
  // Render at least one frame so the field is visible before playback starts.
  analysis?.requestFrame()
})

onBeforeUnmount(() => {
  unsubscribe?.()
  unsubscribe = null
  resizeObserver?.disconnect()
  engine?.dispose()
  engine = null
})
</script>

<template>
  <div ref="wrap" class="audio-visualization">
    <canvas ref="canvas" class="audio-visualization__canvas" />

    <div v-if="DEBUG_SETTINGS" class="audio-visualization__controls">
      <Button
        square
        :variant="showSettings ? 'fill' : 'gray'"
        aria-label="Visualizer settings"
        @click="showSettings = !showSettings"
      >
        <Icon name="ph:sliders-horizontal" />
      </Button>

      <Card v-if="showSettings" class="audio-visualization__panel">
        <Flex x-between y-center class="mb-s">
          <strong class="text-s">Visualizer</strong>
          <Flex gap="xs">
            <Button size="s" variant="gray" @click="resetConfig">
              Reset
            </Button>
            <Button size="s" square variant="gray" aria-label="Close" @click="showSettings = false">
              <Icon name="ph:x" />
            </Button>
          </Flex>
        </Flex>

        <div class="audio-visualization__scroll">
          <Switch v-model="config.shards" class="mb-s" label="Shards on big hits" />
          <div v-for="grp in CONTROL_GROUPS" :key="grp.group" class="audio-visualization__group">
            <span class="audio-visualization__group-title">{{ grp.group }}</span>
            <label v-for="item in grp.items" :key="item.key" class="audio-visualization__knob">
              <Flex x-between y-center>
                <span class="text-xs text-color-light">{{ item.label }}</span>
                <span class="text-xs text-color-lighter">{{ config[item.key].toFixed(item.step < 0.1 ? 3 : 2) }}</span>
              </Flex>
              <Slider
                v-model="config[item.key]"
                :min="item.min"
                :max="item.max"
                :steps="Math.round((item.max - item.min) / item.step)"
                :round="item.step < 0.1 ? 3 : 2"
              />
            </label>
          </div>
        </div>
      </Card>
    </div>
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

  &__controls {
    position: absolute;
    top: var(--space-s);
    right: var(--space-s);
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-xs);
  }

  &__panel {
    width: 260px;
    max-height: min(70vh, 520px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--color-bg-raised);
  }

  &__scroll {
    overflow-y: auto;
    padding-right: var(--space-xxs);
  }

  &__group {
    margin-top: var(--space-s);
  }

  &__group-title {
    display: block;
    font-size: var(--font-size-xxs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-lighter);
    margin-bottom: var(--space-xxs);
  }

  &__knob {
    display: block;
    margin-bottom: var(--space-xs);
  }
}
</style>
