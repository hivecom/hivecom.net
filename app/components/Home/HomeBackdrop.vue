<script setup lang="ts">
import type { CSSProperties } from 'vue'
import LandingHeroShader from '@/components/Landing/LandingHeroBackground.vue'

// Persistent nebula + stars for the home page. Rendered once at the page level
// and kept mounted across the dashboard <-> landing swap, so the WebGL canvas
// never tears down and the nebula never blinks out. The variant only swaps the
// overlay treatment (vignette vs soft edge fade) and base strength, which
// crossfade over the top of the same canvas.
withDefaults(defineProps<{
  variant?: 'dashboard' | 'landing'
}>(), {
  variant: 'landing',
})

// Everything below reads the viewport, so none of it can exist until the
// component is actually in a browser. `import.meta.client` isn't enough of a
// guard: it's already true while Vue is hydrating, so computing here would hand
// the hydrating render values the server never produced and mismatch the whole
// subtree. Gating on mount holds the first client render identical to the HTML
// and fills things in a tick later.
const mounted = ref(false)

// The nebula drifts down a touch and fades as you scroll off the first viewport,
// so it reads as a fixed backdrop dissolving into the page rather than scrolling
// away with it. Applied without a transition so the parallax stays snappy.
const { y: scrollY } = useWindowScroll()
const heroFade = computed(() => {
  if (!mounted.value)
    return 1
  const vh = window.innerHeight || 1
  return Math.max(0, 1 - scrollY.value / (vh * 1.6))
})

// The star parallax offset lives here too: it's the same value for every star
// (each one scales it by its own multiplier), so one write on the container
// beats patching 75 inline styles per scroll tick.
const nebulaVars = computed<CSSProperties | undefined>(() => {
  if (!mounted.value)
    return undefined
  return {
    '--hero-fade': `${heroFade.value}`,
    '--hero-shift': `${scrollY.value * 0.1}px`,
    '--vertical-offset': `${scrollY.value * -0.05}px`,
  }
})

// Randomly scatter stars across the viewport, client-side so we can read its size.
const STAR_COUNT = 75
const STAR_TRANSFORM_THRESHOLD = 0.4

// The parallax depths stars can sit at. Each star used to carry its own
// continuous multiplier, but that made every scroll frame recompute 75 element
// transforms. Snapping the random multiplier to a few shared planes lets the
// wrapper divs carry the transform instead: scroll moves 5 layers, not 75
// elements. The depths are random decoration, so the quantisation doesn't read.
const PLANE_MULTIPLIERS = [0, 0.225, 0.45, 0.675, 0.9]

interface StarPlane {
  multiplier: number
  stars: CSSProperties[]
}

const planes = shallowRef<StarPlane[]>([])

onMounted(() => {
  const _planes: StarPlane[] = PLANE_MULTIPLIERS.map(multiplier => ({ multiplier, stars: [] }))
  const maxMultiplier = PLANE_MULTIPLIERS[PLANE_MULTIPLIERS.length - 1] ?? 1

  for (let i = 0; i < STAR_COUNT; i++) {
    const size = Math.random() * 2 + 0.5
    const verticalRandom = Math.random()
    const baseOpacity = Math.random() * 0.45 + 0.55

    // Same distribution as before (40% hold still, the rest spread over
    // (0, 0.9]), rounded to the nearest plane.
    const multiplier = verticalRandom < STAR_TRANSFORM_THRESHOLD ? 0 : (verticalRandom - STAR_TRANSFORM_THRESHOLD) * 1.5
    const planeIndex = Math.round((multiplier / maxMultiplier) * (PLANE_MULTIPLIERS.length - 1))

    _planes[planeIndex]!.stars.push({
      'left': `${Math.random() * window.innerWidth}px`,
      'top': `${Math.random() * window.innerHeight}px`,
      'width': `${size}px`,
      'height': `${size}px`,
      '--star-animation-offset': `${Math.random() * 10000}ms`,
      '--star-animation-duration': `${Math.random() * 2000 + 2000}ms`,
      '--star-base-opacity': `${baseOpacity}`,
    })
  }

  planes.value = _planes
  mounted.value = true
})
</script>

<template>
  <div
    class="home-backdrop"
    :class="`home-backdrop--${variant}`"
    :style="nebulaVars"
    aria-hidden="true"
  >
    <div class="home-backdrop__nebula">
      <div class="home-backdrop__nebula-fx">
        <ClientOnly>
          <!-- Dashboard runs the drift at half speed for a calmer backdrop.
               Paused once the scroll fade has taken it fully transparent, so
               the GL loop isn't burning frames on an invisible canvas. -->
          <LandingHeroShader class="home-backdrop__shader" :speed="variant === 'dashboard' ? 0.5 : 1" :paused="heroFade === 0" />
        </ClientOnly>
        <!-- Both treatments are always present and crossfade on variant change. -->
        <div class="home-backdrop__overlay home-backdrop__overlay--landing" />
        <div class="home-backdrop__overlay home-backdrop__overlay--dashboard" />
      </div>
    </div>

    <div
      v-for="plane in planes"
      :key="plane.multiplier"
      class="home-backdrop__star-plane"
      :style="{ '--plane-multiplier': plane.multiplier }"
    >
      <div
        v-for="star in plane.stars"
        :key="`${star.left} ${star.top}`"
        class="home-backdrop__star"
        :style="star"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/mixins' as *;

// Self-contained stacking context behind the page content (which sits at z-index
// 1). pointer-events off so it never intercepts clicks.
.home-backdrop {
  // Scroll parallax offset the stars inherit; the inline style overrides this
  // once mounted. Declared here rather than on the star so the per-scroll write
  // stays a single style change on the container.
  --vertical-offset: 0px;

  position: fixed;
  inset: 0;
  // inset alone tracks the visual viewport, which shrinks and grows with the
  // browser chrome on phones. Every scroll step then resizes the shader canvas,
  // and a canvas resize clears it until the next frame paints, so the nebula
  // flickers all the way down the page. lvh pins the height to the large
  // viewport, so scrolling never resizes the backdrop.
  height: 100vh;
  height: 100lvh;
  z-index: 0;
  pointer-events: none;
}

.home-backdrop__nebula {
  position: absolute;
  inset: 0;
  overflow: hidden;
  // Scroll fade, no transition so it tracks scroll immediately.
  opacity: var(--hero-fade, 1);
  will-change: opacity;
}

// Variant base strength crossfades when swapping dashboard <-> landing.
.home-backdrop__nebula-fx {
  position: absolute;
  inset: 0;
  opacity: var(--nebula-base, 1);
  transition: opacity 500ms ease;
}

.home-backdrop--landing .home-backdrop__nebula-fx {
  --nebula-base: 1;
}

.home-backdrop--dashboard .home-backdrop__nebula-fx {
  --nebula-base: 0.2;
}

.home-backdrop__shader {
  position: absolute;
  inset: 0;
  // Behind the overlays so the vignette / edge fade darken the nebula.
  z-index: -1;
  pointer-events: none;
  // Scaled up so the parallax translate has headroom before the canvas edge
  // enters the clipped nebula.
  transform: translate3d(0, var(--hero-shift, 0), 0) scale(1.4);
  will-change: transform;
}

.home-backdrop__overlay {
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 500ms ease;
}

.home-backdrop--landing .home-backdrop__overlay--landing {
  opacity: 1;
}

.home-backdrop--dashboard .home-backdrop__overlay--dashboard {
  opacity: 1;
}

// Landing: dark vignette so the hero logo and globe stay legible, plus a bottom
// fade so the nebula dissolves into the page instead of showing a hard band.
.home-backdrop__overlay--landing {
  background: radial-gradient(
    circle at 50% 50%,
    rgba(0, 0, 0, 0.78) 0%,
    rgba(0, 0, 0, 0.7) 32%,
    rgba(0, 0, 0, 0.48) 55%,
    rgba(0, 0, 0, 0.12) 70%,
    transparent 82%
  );

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    top: 55%;
    background: linear-gradient(transparent, var(--color-bg) 100%);
  }
}

// Dashboard: soft edge fade toward the page background so cards stay legible, no
// heavy vignette.
.home-backdrop__overlay--dashboard {
  background: radial-gradient(
    circle at 50% 0%,
    transparent 0%,
    color-mix(in srgb, var(--color-bg) 70%, transparent) 60%,
    var(--color-bg) 100%
  );
}

:root.light {
  .home-backdrop__overlay--landing {
    background: radial-gradient(
      circle at 50% 50%,
      rgba(255, 255, 255, 0.75) 0%,
      rgba(255, 255, 255, 0.7) 32%,
      rgba(255, 255, 255, 0.55) 55%,
      rgba(255, 255, 255, 0.35) 70%,
      transparent 82%
    );
  }
}

// One layer per parallax depth. The scroll offset lands here as a single
// composited transform, so the stars inside ride along without any per-star
// style work.
.home-backdrop__star-plane {
  --plane-multiplier: 0;

  position: absolute;
  inset: 0;
  // Above the nebula, below the page content (the whole backdrop is z-index 0).
  z-index: 1;
  pointer-events: none;
  transform: translateY(calc(var(--vertical-offset) * var(--plane-multiplier)));
  will-change: transform;
}

.home-backdrop__star {
  --star-animation-offset: 0ms;
  --star-animation-duration: 2000ms;
  --star-base-opacity: 1;

  position: absolute;
  border-radius: 50%;
  @include star-flicker-layers;
}

// Keyframes live in the shared mixin so the landing constellation stars can
// twinkle the same way.
@include star-flicker;
</style>
