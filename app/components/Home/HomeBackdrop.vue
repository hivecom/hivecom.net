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

// The nebula drifts down a touch and fades as you scroll off the first viewport,
// so it reads as a fixed backdrop dissolving into the page rather than scrolling
// away with it. Applied without a transition so the parallax stays snappy.
const { y: scrollY } = useWindowScroll()
const nebulaVars = computed<CSSProperties | undefined>(() => {
  if (!import.meta.client)
    return undefined
  const vh = window.innerHeight || 1
  const fade = Math.max(0, 1 - scrollY.value / (vh * 1.6))
  return {
    '--hero-fade': `${fade}`,
    '--hero-shift': `${scrollY.value * 0.1}px`,
  }
})

// Randomly scatter stars across the viewport, client-side so we can read its size.
const STAR_COUNT = 75
const STAR_TRANSFORM_THRESHOLD = 0.4
const stars = shallowRef<CSSProperties[]>([])

onBeforeMount(() => {
  const _stars: CSSProperties[] = []
  for (let i = 0; i < STAR_COUNT; i++) {
    const size = Math.random() * 2 + 0.5
    const verticalRandom = Math.random()
    const baseOpacity = Math.random() * 0.45 + 0.55

    _stars.push({
      'left': `${Math.random() * window.innerWidth}px`,
      'top': `${Math.random() * window.innerHeight}px`,
      'width': `${size}px`,
      'height': `${size}px`,
      '--star-animation-offset': `${Math.random() * 10000}ms`,
      '--star-animation-duration': `${Math.random() * 2000 + 2000}ms`,
      '--star-base-opacity': `${baseOpacity}`,
      '--vertical-random-multiplier': `${verticalRandom < STAR_TRANSFORM_THRESHOLD ? 0 : (verticalRandom - STAR_TRANSFORM_THRESHOLD) * 1.5}`,
      '--vertical-offset': 0,
    })
  }

  stars.value = _stars
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
          <!-- Dashboard runs the drift at half speed for a calmer backdrop. -->
          <LandingHeroShader class="home-backdrop__shader" :speed="variant === 'dashboard' ? 0.5 : 1" />
        </ClientOnly>
        <!-- Both treatments are always present and crossfade on variant change. -->
        <div class="home-backdrop__overlay home-backdrop__overlay--landing" />
        <div class="home-backdrop__overlay home-backdrop__overlay--dashboard" />
      </div>
    </div>

    <div
      v-for="star in stars"
      :key="`${star.left} ${star.top}`"
      class="home-backdrop__star"
      :style="{ ...star,
                '--vertical-offset': `${scrollY * -0.05}px` }"
    />
  </div>
</template>

<style lang="scss" scoped>
// Self-contained stacking context behind the page content (which sits at z-index
// 1). pointer-events off so it never intercepts clicks.
.home-backdrop {
  position: fixed;
  inset: 0;
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

.home-backdrop__star {
  --star-animation-offset: 0ms;
  --star-animation-duration: 2000ms;
  --star-base-opacity: 1;
  --vertical-random-multiplier: 0;
  --vertical-offset: 0px;

  transform: translateY(calc(var(--vertical-offset) * var(--vertical-random-multiplier)));

  position: fixed;
  // Above the nebula, below the page content (the whole backdrop is z-index 0).
  z-index: 1;
  background-color: var(--color-text);
  border-radius: 50%;
  animation: star-flicker 2000ms infinite linear;
  animation-delay: var(--star-animation-offset);
  animation-duration: var(--star-animation-duration);
}

@keyframes star-flicker {
  0%,
  15%,
  35%,
  55%,
  75%,
  100% {
    opacity: calc(var(--star-base-opacity) * 1);
    background: white;
    filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.8));
  }

  10% {
    opacity: calc(var(--star-base-opacity) * 0.75);
  }

  20% {
    opacity: calc(var(--star-base-opacity) * 0.85);
    background: rgb(160, 210, 255);
    filter: drop-shadow(0 0 8px rgba(120, 190, 255, 1));
  }

  25% {
    opacity: calc(var(--star-base-opacity) * 1);
    background: white;
    filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.8));
  }

  45% {
    opacity: calc(var(--star-base-opacity) * 0.7);
  }

  60% {
    opacity: calc(var(--star-base-opacity) * 0.85);
    background: rgb(255, 190, 190);
    filter: drop-shadow(0 0 8px rgba(255, 120, 120, 1));
  }

  65% {
    opacity: calc(var(--star-base-opacity) * 1);
    background: white;
    filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.8));
  }

  85% {
    opacity: calc(var(--star-base-opacity) * 0.8);
  }
}
</style>
