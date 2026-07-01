<script setup lang="ts">
import type { SunColors, SunField } from '@/lib/landing/sun-field'
import { onBeforeUnmount, onMounted, ref } from 'vue'

// The procedural sun at the bottom of the landing page. The heavy lifting lives
// in lib/landing/sun-field (Three, client-only); this component owns the canvas,
// the theme colours, and the two things that keep it cheap:
//
//  - It only runs while the sun band is on screen. An IntersectionObserver wakes
//    the engine and the raf loop when the band scrolls near the viewport and
//    parks them the moment it leaves, so nothing renders while you're up top.
//  - The sun rises with scroll: how far the band has climbed into view drives the
//    engine's rise, so the sun crests the bottom edge as you reach the page end.
//
// Degrades to a static CSS sun when WebGL is missing or the user prefers reduced
// motion, so it's never blank.

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

function readColors(): SunColors {
  return {
    accent: readThemeColor('--color-accent', [0.65, 0.99, 0.18], { normalized: true }) as [number, number, number],
  }
}

// Rise 0..1 as the band scrolls up: 0 when its top touches the bottom of the
// viewport, 1 once it has climbed ~0.6 of a viewport further, so the sun is well
// up by the time you reach the constellation rather than only at the page end.
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

  const w = host.clientWidth
  const h = host.clientHeight
  if (w > 0 && h > 0)
    engine.resize(w, h, Math.min(window.devicePixelRatio || 1, 2))

  engine.setRise(computeRise())
  engine.frame(dt, now / 1000)

  // Park the moment the band leaves the viewport.
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

// Repaint on light/dark flip, the way the globe and smoke field do.
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
