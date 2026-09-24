<script setup lang="ts">
import type { CSSProperties } from 'vue'
import LandingHeroShader from '@/components/Landing/LandingHeroBackground.vue'

// Stays mounted across the dashboard and landing swap so the WebGL canvas never
// tears down. The variant only crossfades the overlay and base strength.
withDefaults(defineProps<{
  variant?: 'dashboard' | 'landing'
}>(), {
  variant: 'landing',
})

// Everything below reads the viewport. import.meta.client is already true while
// hydrating, which would mismatch the server HTML, so this gates on mount instead.
const mounted = ref(false)

// Fades over the first viewport of scroll so the backdrop dissolves into the page
const { y: scrollY } = useWindowScroll()
const heroFade = computed(() => {
  if (!mounted.value)
    return 1
  const vh = window.innerHeight || 1
  return Math.max(0, 1 - scrollY.value / (vh * 1.6))
})

// One write on the container beats patching every star's inline style per scroll tick
const nebulaVars = computed<CSSProperties | undefined>(() => {
  if (!mounted.value)
    return undefined
  return {
    '--hero-fade': `${heroFade.value}`,
    '--hero-shift': `${scrollY.value * 0.1}px`,
    '--vertical-offset': `${scrollY.value * -0.05}px`,
  }
})

const STAR_COUNT = 75
const STAR_TRANSFORM_THRESHOLD = 0.4

// Stars snap to a few shared depth planes, so scrolling transforms the plane
// wrappers instead of every star. The quantisation doesn't show.
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

    // 40% hold still, the rest spread over (0, 0.9], rounded to the nearest plane
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
          <!-- Paused once the scroll fade makes it invisible, so the GL loop stops burning frames -->
          <LandingHeroShader class="home-backdrop__shader" :speed="variant === 'dashboard' ? 0.5 : 1" :paused="heroFade === 0" />
        </ClientOnly>
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

// Behind the page content, which sits at z-index 1
.home-backdrop {
  // The inline style overrides this once mounted
  --vertical-offset: 0px;

  position: fixed;
  inset: 0;
  // inset alone follows the phone's browser chrome, and every canvas resize
  // clears it until the next paint, so the nebula flickers. lvh pins the height.
  height: 100vh;
  height: 100lvh;
  z-index: 0;
  pointer-events: none;
}

.home-backdrop__nebula {
  position: absolute;
  inset: 0;
  overflow: hidden;
  // No transition, so it tracks scroll immediately
  opacity: var(--hero-fade, 1);
  will-change: opacity;
}

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
  z-index: -1;
  pointer-events: none;
  // Headroom for the parallax before the canvas edge shows
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

// Vignette keeps the hero legible. The bottom fade avoids a hard band.
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

.home-backdrop__star-plane {
  --plane-multiplier: 0;

  position: absolute;
  inset: 0;
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

@include star-flicker;
</style>
