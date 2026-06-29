<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { decodeAudio } from '@/lib/audio/decode'
import { hannWindow, RealFFT } from '@/lib/audio/fft'

// The live, music-reactive bar visualizer. It decodes the track once and then,
// each frame while playing, runs a single windowed FFT at the playhead, so the
// work is one small transform per frame instead of analyzing the whole track up
// front. It never taps the live <audio> element (which would risk muting
// cross-origin tracks, see lib/audio/decode). When paused the bars decay to a
// flat baseline and the loop idles, so the panel always holds its space.

const props = defineProps<{
  // Track URL. Swapping it re-decodes.
  src: string
  // Playback position as a 0..1 fraction, where we window the FFT.
  progress: number
  // Total duration in seconds, used to advance the scan smoothly between the
  // ~4Hz progress updates.
  duration: number
  // Whether the engine is playing, so the FFT loop only runs then.
  playing: boolean
  // Whether the engine is buffering/seeking. The spectrum reads decoded PCM at an
  // extrapolated playhead, not the live element, so without this it keeps moving
  // through a seek gap while no sound is out. Gating on it idles the bars then.
  loading?: boolean
  // Optional fixed bar count. Leave unset and the panel picks a count from its
  // width so bars never get thinner than MIN_BAR_PX, which is what smeared the
  // mobile view. Set it to pin a specific resolution.
  bars?: number
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const wrap = ref<HTMLElement | null>(null)

// Decoded PCM we window per frame. We FFT channel 0 directly, no mono copy, so
// the only memory held is the decoded buffer itself.
let samples: Float32Array | null = null
let sampleCount = 0
let sampleRate = 44100
let rafId: number | null = null

// Two windows' worth of FFT scratch, reused every frame. The short window keeps
// the upper bars snappy; the long (DOUBLE) window drives the lower third, where
// the extra length buys finer bass bins and averages over more time, so that end
// reacts more gently.
const FFT_SIZE = 8192
const DOUBLE = FFT_SIZE * 2
const HALF = FFT_SIZE / 2
const DOUBLE_HALF = DOUBLE / 2
const hann = hannWindow(FFT_SIZE)
const hannBig = hannWindow(DOUBLE)
const transform = new RealFFT(FFT_SIZE)
const transformBig = new RealFFT(DOUBLE)
const frameBuf = new Float32Array(FFT_SIZE)
const frameBufBig = new Float32Array(DOUBLE)
const mags = new Float32Array(HALF)
const magsBig = new Float32Array(DOUBLE_HALF)
// dB window the bars normalize into. Magnitudes are scaled by the transform size
// first (a full-scale tone lands near -12 dB after that), so this window runs
// from the noise floor up to roughly the loudest a band ever reaches.
const FLOOR_DB = -80
const MAX_DB = -30

// Most bars we ever draw; the active count collapses below this on narrow panels
// so bars never get thinner than MIN_BAR_PX (what turned the mobile view into a
// smear). Arrays are sized to the max and we only ever touch the first
// `activeBars`. `lowBars` is how many, from the bass up, read the long window.
const MAX_BARS = 256
const MIN_BARS = 24
const MIN_BAR_PX = 3
const BAR_GAP = 2
let activeBars = MAX_BARS
let lowBars = Math.floor(MAX_BARS / 3)
const levels = new Float32Array(MAX_BARS)
const target = new Float32Array(MAX_BARS)

// Peak-hold caps: each snaps up to a bar's level then falls under gravity, so a
// transient leaves a marker that drifts back down. `holdVel` accelerates the
// fall the longer it's been dropping.
const holds = new Float32Array(MAX_BARS)
const holdVel = new Float32Array(MAX_BARS)
const HOLD_GRAVITY = 0.00001

// Frequency range the bars span, log-spaced across it the way we hear pitch.
// Capping well below Nyquist drops the near-silent top octaves that otherwise
// leave a dead tail of motionless high-frequency bars on the right.
const MIN_FREQ = 30
const MAX_FREQ = 16000
const barLo = new Int32Array(MAX_BARS)
const barHi = new Int32Array(MAX_BARS)

// Map each bar to a log-spaced bin range in whichever FFT feeds it: the lower
// third indexes the long window's bins, the rest the short window's. Recomputed
// once the sample rate is known (that sets how many bins a frequency spans) and
// whenever the active bar count changes.
function computeBands() {
  const nyquist = sampleRate / 2
  const ratio = MAX_FREQ / MIN_FREQ
  for (let j = 0; j < activeBars; j++) {
    const half = j < lowBars ? DOUBLE_HALF : HALF
    const f0 = MIN_FREQ * ratio ** (j / activeBars)
    const f1 = MIN_FREQ * ratio ** ((j + 1) / activeBars)
    const lo = Math.max(1, Math.floor((f0 / nyquist) * half))
    const hi = Math.max(lo + 1, Math.floor((f1 / nyquist) * half))
    barLo[j] = lo
    barHi[j] = Math.min(half, hi)
  }
}

// Set how many bars we draw, clamped to the readable range, and remap the bands.
// Levels reset so a freshly grown bar doesn't pop in at a stale height.
function setBarCount(n: number) {
  const clamped = Math.max(MIN_BARS, Math.min(MAX_BARS, Math.floor(n)))
  if (clamped === activeBars)
    return
  activeBars = clamped
  lowBars = Math.floor(activeBars / 3)
  levels.fill(0)
  target.fill(0)
  holds.fill(0)
  holdVel.fill(0)
  computeBands()
}

// The progress value last handed to us and when it landed, so we can extrapolate
// a smooth playhead between updates instead of stepping four times a second.
let basisProgress = 0
let basisAt = 0

// Read a CSS custom property as an [r, g, b] triple, falling back if it can't be
// parsed or we're on the server.
function readColor(name: string, fallback: [number, number, number]): [number, number, number] {
  if (!import.meta.client)
    return fallback
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const hex = raw.match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const n = Number.parseInt(hex[1]!, 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const rgb = raw.match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/)
  if (rgb)
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  return fallback
}

let accent: [number, number, number] = [167, 252, 47]
let axis: [number, number, number] = [110, 110, 110]

// dB gridlines drawn across the panel, and the C notes labelled along the bottom
// (one per octave). Both are derived once; the notes within the displayed
// frequency range get an x from the same log mapping the bars use.
const DB_MARKS = [-20, -40, -60]
const LOG_RANGE = Math.log(MAX_FREQ / MIN_FREQ)
const NOTES = (() => {
  const out: { label: string, freq: number }[] = []
  // C1 = 32.703 Hz, doubling each octave.
  for (let octave = 1, freq = 32.703; freq < MAX_FREQ; octave++, freq *= 2) {
    if (freq >= MIN_FREQ)
      out.push({ label: `C${octave}`, freq })
  }
  return out
})()

// Window both sizes centered on `center`, transform each, and pool the
// magnitudes into the bar targets. Each bar reads from the FFT its band was
// mapped against in computeBands.
function analyzeAt(center: number) {
  // Short window for the snappy upper bars.
  const start = center - HALF
  for (let i = 0; i < FFT_SIZE; i++) {
    const s = start + i
    frameBuf[i] = (s >= 0 && s < sampleCount ? samples![s]! : 0) * hann[i]!
  }
  transform.magnitudes(frameBuf, mags)

  // Long window for the lower third: finer bass bins, smoother over time.
  const startBig = center - DOUBLE_HALF
  for (let i = 0; i < DOUBLE; i++) {
    const s = startBig + i
    frameBufBig[i] = (s >= 0 && s < sampleCount ? samples![s]! : 0) * hannBig[i]!
  }
  transformBig.magnitudes(frameBufBig, magsBig)

  for (let j = 0; j < activeBars; j++) {
    const big = j < lowBars
    const src = big ? magsBig : mags
    const size = big ? DOUBLE : FFT_SIZE
    let mag = 0
    const hi = barHi[j]!
    for (let b = barLo[j]!; b < hi; b++) {
      if (src[b]! > mag)
        mag = src[b]!
    }
    // Scale by the transform size so the dB window is meaningful (an unnormalized
    // FFT magnitude is huge and would clamp every band to the top); both windows
    // land on the same scale once divided by their own size.
    const db = 20 * Math.log10(mag / size + 1e-9)
    target[j] = Math.max(0, Math.min(1, (db - FLOOR_DB) / (MAX_DB - FLOOR_DB)))
  }
}

function frame(now: number) {
  const cv = canvas.value
  const host = wrap.value
  if (!cv || !host) {
    rafId = null
    return
  }

  const w = host.clientWidth
  const h = host.clientHeight

  // Collapse the bar count on narrow panels so each bar keeps at least
  // MIN_BAR_PX of width. A `bars` prop pins it instead. This must run before
  // analyzeAt so the bands match the count we draw.
  if (w > 0)
    setBarCount(props.bars ?? w / (MIN_BAR_PX + BAR_GAP))

  // Feed the bar targets. While playing and not stalled, FFT at the extrapolated
  // playhead; otherwise (paused, or buffering through a seek) let them decay to
  // the baseline so motion tracks what's audible.
  if (props.playing && !props.loading && samples && sampleCount > 0) {
    const elapsed = props.duration > 0 ? (now - basisAt) / 1000 / props.duration : 0
    const playhead = Math.max(0, Math.min(1, basisProgress + elapsed))
    analyzeAt(Math.floor(playhead * sampleCount))
  }
  else {
    target.fill(0)
  }

  // Snappy attack, eased decay, the classic analyzer feel. The hold cap rides up
  // with the bar and falls back under gravity once the bar drops away.
  let alive = false
  for (let j = 0; j < activeBars; j++) {
    const t = target[j]!
    const cur = levels[j]!
    const next = t > cur ? cur + (t - cur) * 0.55 : cur + (t - cur) * 0.16
    levels[j] = next

    if (next >= holds[j]!) {
      holds[j] = next
      holdVel[j] = 0
    }
    else {
      holdVel[j]! += HOLD_GRAVITY
      holds[j] = Math.max(next, holds[j]! - holdVel[j]!)
    }

    if (next > 0.002 || holds[j]! > 0.002)
      alive = true
  }

  if (w > 0 && h > 0) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
    }
    const ctx = cv.getContext('2d')
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const [ar, ag, ab] = accent
      const [xr, xg, xb] = axis
      const gap = BAR_GAP
      const barW = (w - gap * (activeBars - 1)) / activeBars
      const step = barW + gap
      // Reserve a thin strip at the bottom for note labels when there's room, and
      // skip the whole axis when the panel is too short to fit it.
      const showAxes = h > 72
      const baseY = showAxes ? h - 14 : h
      const maxH = baseY * 0.92
      const capH = 1
      const solid = `rgb(${ar}, ${ag}, ${ab})`

      // Map a dB value to a y, and a frequency to an x (same log mapping the bars
      // use), so the scales line up with the data.
      const yForDb = (d: number) => baseY - ((d - FLOOR_DB) / (MAX_DB - FLOOR_DB)) * maxH
      const xForFreq = (f: number) => (activeBars * Math.log(f / MIN_FREQ) / LOG_RANGE) * step + barW / 2

      // dB gridlines behind the bars.
      if (showAxes) {
        ctx.lineWidth = 1
        ctx.strokeStyle = `rgba(${xr}, ${xg}, ${xb}, 0.16)`
        ctx.beginPath()
        for (const d of DB_MARKS) {
          const y = Math.round(yForDb(d)) + 0.5
          ctx.moveTo(0, y)
          ctx.lineTo(w, y)
        }
        ctx.stroke()
      }

      for (let j = 0; j < activeBars; j++) {
        const barH = Math.max(2, levels[j]! * maxH)
        const x = j * step
        const y = baseY - barH
        const grad = ctx.createLinearGradient(0, y, 0, baseY)
        grad.addColorStop(0, `rgba(${ar}, ${ag}, ${ab}, 0.25)`)
        grad.addColorStop(1, `rgb(${ar}, ${ag}, ${ab})`)
        ctx.fillStyle = grad
        ctx.fillRect(x, y, barW, barH)

        // Solid accent peak-hold cap, sitting at the held level above the bar.
        const capY = baseY - holds[j]! * maxH - capH
        ctx.fillStyle = solid
        ctx.fillRect(x, Math.max(0, capY), barW, capH)
      }

      // Labels on top: dB up the left (backed so they read over bright bars), C
      // notes along the bottom strip.
      if (showAxes) {
        ctx.font = '10px ui-sans-serif, system-ui, sans-serif'
        ctx.textBaseline = 'middle'
        ctx.textAlign = 'left'
        for (const d of DB_MARKS) {
          const y = yForDb(d)
          const label = `${d}`
          const tw = ctx.measureText(label).width
          ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
          ctx.fillRect(1, y - 6, tw + 4, 12)
          ctx.fillStyle = `rgba(${xr}, ${xg}, ${xb}, 0.85)`
          ctx.fillText(label, 3, y)
        }

        ctx.textBaseline = 'alphabetic'
        ctx.textAlign = 'center'
        ctx.fillStyle = `rgba(${xr}, ${xg}, ${xb}, 0.7)`
        for (const note of NOTES) {
          const x = xForFreq(note.freq)
          if (x < 8 || x > w - 8)
            continue
          ctx.fillText(note.label, x, h - 3)
        }
      }
    }
  }

  // Keep looping while playing or while the bars are still settling; otherwise
  // park until playback resumes.
  if (props.playing || alive)
    rafId = requestAnimationFrame(frame)
  else
    rafId = null
}

function startLoop() {
  rafId ??= requestAnimationFrame(frame)
}

function stopLoop() {
  if (rafId != null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
}

async function load() {
  samples = null
  sampleCount = 0
  levels.fill(0)
  const src = props.src
  try {
    const buffer = await decodeAudio(src)
    if (src !== props.src)
      return
    accent = readColor('--color-accent', [167, 252, 47])
    axis = readColor('--color-text-lighter', [110, 110, 110])
    samples = buffer.getChannelData(0)
    sampleCount = buffer.length
    sampleRate = buffer.sampleRate
    computeBands()
    if (props.playing)
      startLoop()
  }
  catch {
    // No audio (e.g. cross-origin without CORS). The row just stays flat.
    samples = null
  }
}

watch(() => props.src, load, { immediate: true })

// Run the loop while playing; a final settle pass lets the bars fall when paused.
watch(() => props.playing, () => startLoop())

// Re-anchor the extrapolation whenever a fresh progress value arrives.
watch(() => props.progress, (value) => {
  basisProgress = value
  basisAt = import.meta.client ? performance.now() : 0
}, { immediate: true })

// Watch the panel size so the bar count re-collapses on resize or orientation
// change even while paused, when the loop would otherwise be parked. A single
// frame redraws at the new width and parks again if nothing is animating.
let resizeObserver: ResizeObserver | null = null

onBeforeUnmount(() => {
  stopLoop()
  resizeObserver?.disconnect()
})

watch(wrap, (el) => {
  resizeObserver?.disconnect()
  if (el) {
    if (import.meta.client && 'ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(() => startLoop())
      resizeObserver.observe(el)
    }
    startLoop()
  }
})
</script>

<template>
  <div ref="wrap" class="audio-spectrum">
    <canvas ref="canvas" class="audio-spectrum__canvas" />
  </div>
</template>

<style scoped lang="scss">
.audio-spectrum {
  position: relative;
  width: 100%;
  height: 100%;

  &__canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
}
</style>
