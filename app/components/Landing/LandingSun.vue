<script setup lang="ts">
import type { SunColors, SunField } from '@/lib/landing/sun-field'
import { onBeforeUnmount, onMounted, ref } from 'vue'

// Rendering lives in lib/landing/sun-field (Three, client-only). The loop only runs
// while the band is near the viewport, and it falls back to a static CSS sun without
// WebGL or with reduced motion.

const canvas = ref<HTMLCanvasElement | null>(null)
const wrap = ref<HTMLElement | null>(null)

const reducedMotion = ref(false)
const webglFailed = ref(false)

let engine: SunField | null = null
let engineLoading = false
let observer: IntersectionObserver | null = null
// Whether the band is on screen: the loop keeps going while this is true.
let active = false
let lastNow = 0

// Host size, cached by the resize observer below so the frame loop doesn't
// read clientWidth/clientHeight (layout) every tick. The engine's own resize
// bails when nothing changed, so passing the cached size per frame is free.
let hostWidth = 0
let hostHeight = 0

useResizeObserver(wrap, (entries) => {
  const rect = entries[0]?.contentRect
  if (!rect)
    return
  hostWidth = rect.width
  hostHeight = rect.height
})

function readColors(): SunColors {
  return {
    accent: readThemeColor('--color-accent', [0.65, 0.99, 0.18], { normalized: true }) as [number, number, number],
    // The field derives its heat ramp off the accent, and needs the page colour
    // to know whether "hot" means white or saturated gold.
    bg: readThemeColor('--color-bg', [0.07, 0.07, 0.07], { normalized: true }) as [number, number, number],
  }
}

// Rise 0..1: 0 when the band's top touches the viewport bottom, 1 once it has climbed
// ~0.6 of a viewport further, so the sun is up by the time you reach the constellation.
function computeRise(): number {
  const host = wrap.value
  if (!host)
    return 0
  const vh = window.innerHeight || 1
  const progress = (vh - host.getBoundingClientRect().top) / (vh * 0.6)
  return Math.max(0, Math.min(1, progress))
}

const { start: startLoop, stop: stopLoop } = useCanvasLoop((now) => {
  const host = wrap.value
  if (!engine || !host)
    return false

  const dt = lastNow ? (now - lastNow) / 1000 : 1 / 60
  lastNow = now

  if (hostWidth > 0 && hostHeight > 0)
    engine.resize(hostWidth, hostHeight, Math.min(window.devicePixelRatio || 1, 2))

  engine.setRise(computeRise())
  engine.frame(dt, now / 1000)

  return active
})

async function ensureEngine() {
  if (engine || engineLoading || !import.meta.client)
    return
  const el = canvas.value
  if (!el)
    return
  engineLoading = true
  try {
    const { SunField } = await import('@/lib/landing/sun-field')
    if (el !== canvas.value)
      return
    engine = await SunField.create(el, readColors())
    if (!engine)
      webglFailed.value = true
  }
  finally {
    engineLoading = false
  }
}

onMounted(() => {
  reducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reducedMotion.value)
    return

  const host = wrap.value
  if (!host)
    return

  // rootMargin gives the engine a head start so it's warm before it's visible.
  observer = new IntersectionObserver((entries) => {
    const entry = entries[0]
    if (!entry)
      return
    if (entry.isIntersecting) {
      active = true
      lastNow = 0
      ensureEngine().then(() => {
        if (active)
          startLoop()
      })
    }
    else {
      active = false
    }
  }, { rootMargin: '200px 0px' })
  observer.observe(host)
})

onThemeChange(() => {
  engine?.setColors(readColors())
  if (active)
    startLoop()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  stopLoop()
  engine?.dispose()
  engine = null
})
</script>

<template>
  <div ref="wrap" class="landing-sun" aria-hidden="true">
    <canvas v-if="!reducedMotion" ref="canvas" class="landing-sun__canvas" />
    <div v-if="reducedMotion || webglFailed" class="landing-sun__fallback" />
  </div>
</template>

<style scoped lang="scss">
.landing-sun {
  position: relative;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: hidden;
}

.landing-sun__canvas {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}

// Static stand-in for reduced motion / no WebGL: a soft accent glow cresting the
// bottom edge, matching where the shader sun sits.
.landing-sun__fallback {
  position: absolute;
  left: 50%;
  bottom: -55%;
  width: min(160%, 1600px);
  aspect-ratio: 1;
  transform: translateX(-50%);
  border-radius: 50%;
  background: radial-gradient(
    circle at 50% 50%,
    color-mix(in srgb, var(--color-accent) 92%, white) 0%,
    var(--color-accent) 20%,
    color-mix(in srgb, var(--color-accent) 55%, transparent) 44%,
    transparent 66%
  );
}
</style>
