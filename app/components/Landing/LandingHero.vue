<script setup lang="ts">
import type { MetricsSnapshot } from '@/types/metrics'
import { computed, defineAsyncComponent, onBeforeUnmount } from 'vue'
import constants from '~~/constants.json'
import LandingHeroActions from '@/components/Landing/LandingHeroActions.vue'
import LandingHeroShader from '@/components/Landing/LandingHeroBackground.vue'
import LandingHeroStats from '@/components/Landing/LandingHeroStats.vue'
import LandingMotd from '@/components/Landing/LandingMotd.vue'

interface CommunityStats {
  users: number
  usersAccurate: boolean
  gameservers: number
  age: number
  projects: number
  forumPosts: number
}

const loading = ref(true)
const errorMessage = ref('')

// The nebula backdrop (shader + vignette + bottom fade) is pinned to the viewport
// and drifts down a touch while fading out as you scroll off the hero, so it
// reads as a fixed backdrop that dissolves as a unit rather than scrolling away
// with the page. Exposed as CSS vars so the pseudo-element vignette and fade move
// with it too.
const { y: heroScrollY } = useWindowScroll()
const heroBackdropVars = computed(() => {
  if (!import.meta.client)
    return undefined
  const vh = window.innerHeight || 1
  const fade = Math.max(0, 1 - heroScrollY.value / (vh * 1.6))
  return {
    '--hero-fade': `${fade}`,
    '--hero-shift': `${heroScrollY.value * 0.1}px`,
  }
})

const { fetchMetrics, metrics: cachedMetrics } = useDataMetrics()

const communityStats = ref<CommunityStats>({
  users: 100,
  usersAccurate: false,
  gameservers: 5,
  age: new Date().getFullYear() - 2013,
  projects: 10,
  forumPosts: 1000,
})

function applyMetrics(snapshot: MetricsSnapshot): void {
  const users = snapshot.users.total
  communityStats.value.usersAccurate = users > 0
  communityStats.value.users = users > 0 ? users : 100
  communityStats.value.gameservers = snapshot.gameservers.total
  communityStats.value.projects = snapshot.community.projects
  communityStats.value.forumPosts = snapshot.discussions.total
}

// Pre-populate from cache synchronously - avoids placeholder numbers on warm visits
if (cachedMetrics.value !== null)
  applyMetrics(cachedMetrics.value)

// Fetch real data on component mount
onBeforeMount(async () => {
  try {
    const metricsSnapshot = await fetchMetrics()
    if (metricsSnapshot != null)
      applyMetrics(metricsSnapshot)
  }
  catch (error: unknown) {
    console.error('Error fetching data:', error)
    errorMessage.value = (error as Error).message || 'Failed to fetch data'
  }
  finally {
    loading.value = false
  }
})

const LandingHeroGlobe = defineAsyncComponent(() => import('@/components/Landing/LandingHeroGlobe.vue'))

const defaultSplashMessage
  = (typeof constants.SPLASH_MESSAGE === 'string' && constants.SPLASH_MESSAGE.trim())
    ? constants.SPLASH_MESSAGE
    : 'A community of friends from all around the world'

const splashMessage = ref(defaultSplashMessage)

// Splash fades out when the globe signals it has rendered its first frame.
// Fallback timeout covers the case where the globe fails to load entirely or
// takes pathologically long, so users are never stuck looking at a placeholder.
const globeReady = ref(false)
let splashFallbackTimer: ReturnType<typeof setTimeout> | null = null

function handleGlobeReady() {
  globeReady.value = true
  if (splashFallbackTimer != null) {
    clearTimeout(splashFallbackTimer)
    splashFallbackTimer = null
  }
}

onMounted(() => {
  splashFallbackTimer = setTimeout(() => {
    globeReady.value = true
    splashFallbackTimer = null
  }, 8000)
})

onBeforeUnmount(() => {
  if (splashFallbackTimer != null) {
    clearTimeout(splashFallbackTimer)
    splashFallbackTimer = null
  }
})

onMounted(() => {
  const alternatives = Array.isArray(constants.SPLASH_ALTERNATIVES)
    ? constants.SPLASH_ALTERNATIVES.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    : []

  if (alternatives.length === 0) {
    splashMessage.value = defaultSplashMessage
    return
  }

  const rawChance = typeof constants.SPLASH_ALTERNATIVES_CHANCE === 'number'
    ? constants.SPLASH_ALTERNATIVES_CHANCE
    : 0
  const chance = Math.min(1, Math.max(0, Number.isFinite(rawChance) ? rawChance : 0))

  if (Math.random() >= chance) {
    splashMessage.value = defaultSplashMessage
    return
  }

  const idx = Math.floor(Math.random() * alternatives.length)
  splashMessage.value = alternatives[idx] ?? defaultSplashMessage
})
</script>

<template>
  <section class="hero-overlay" :style="heroBackdropVars">
    <div class="hero-overlay__backdrop">
      <LandingHeroShader class="hero-overlay__shader" />
    </div>
    <div class="hero-overlay__body">
      <div class="hero-overlay__splash-base" :class="{ 'is-faded': globeReady }" aria-hidden="true" />
      <div class="hero-overlay__splash" :class="{ 'is-faded': globeReady }" aria-hidden="true" />
      <ClientOnly>
        <LandingHeroGlobe @ready="handleGlobeReady" />
      </ClientOnly>

      <div class="hero-overlay__text">
        <h1 class="visually-hidden">
          Hivecom
        </h1>
        <img src="/logotype-white.svg" class="hero-overlay__logo">
      </div>

      <LandingHeroStats class="hero-overlay__stats" :community-stats="communityStats" :loading="loading" />
      <LandingMotd :fallback-text="splashMessage" />
      <LandingHeroActions />
    </div>
  </section>
</template>

<style scoped lang="scss">
:root.light {
  .hero-overlay__backdrop::after {
    background: radial-gradient(
      circle at 50% 50%,
      rgba(255, 255, 255, 0.75) 0%,
      rgba(255, 255, 255, 0.7) 32%,
      rgba(255, 255, 255, 0.55) 55%,
      rgba(255, 255, 255, 0.35) 70%,
      transparent 82%
    );
  }

  .hero-overlay::before {
    border-bottom-color: rgba(0, 0, 0, 0.08);
  }

  .hero-overlay__splash-base {
    background-image: url('/landing/splash-light.jpg');
  }

  .hero-overlay__splash {
    background-image: url('/landing/splash-light.jpg');

    &::after {
      background-color: color-mix(in srgb, var(--color-accent) 40%, transparent);
    }
  }

  .hero-overlay__logo {
    filter: invert(1);
  }
}

.hero-overlay {
  pointer-events: auto;
  position: relative;
  width: 100%;
  margin: 0 auto;
  min-height: 100vh;
  display: flex;
  align-items: stretch;

  // The whole nebula unit: shader, vignette, and bottom fade pinned to the
  // viewport and faded/drifted together via the --hero-fade / --hero-shift vars.
  &__backdrop {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    // Clips the oversized shader so the parallax translate never exposes its
    // edge. The vignette and bottom fade stay pinned here (not translated), so
    // there's no gap to reveal the canvas against the page.
    overflow: hidden;
    opacity: var(--hero-fade, 1);
    will-change: opacity;

    // Vignette: dark centre fading out to the edges, over the nebula.
    &::after {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(
        circle at 50% 50%,
        rgba(0, 0, 0, 0.78) 0%,
        rgba(0, 0, 0, 0.7) 32%,
        rgba(0, 0, 0, 0.48) 55%,
        rgba(0, 0, 0, 0.12) 70%,
        transparent 82%
      );
    }

    // Bottom fade so the nebula dissolves into the page instead of showing a
    // hard green band below the hero as it scrolls.
    &::before {
      content: '';
      position: absolute;
      inset: 0;
      top: 55%;
      background: linear-gradient(transparent, var(--color-bg) 100%);
    }
  }

  &__shader {
    position: absolute;
    inset: 0;
    // Behind the backdrop's vignette (::after) and bottom fade (::before) so both
    // darken the nebula. Without this the canvas paints over them and the nebula
    // floods green.
    z-index: -1;
    pointer-events: none;
    // Scaled up so the parallax translate has headroom on every side before the
    // canvas edge would enter the clipped backdrop.
    transform: translate3d(0, var(--hero-shift, 0), 0) scale(1.4);
    will-change: transform;
  }
}

.hero-overlay__splash-base {
  position: absolute;
  inset: 0;
  z-index: 3;
  background-image: url('/landing/splash-dark.jpg');
  background-size: cover;
  background-position: center;
  opacity: 1;
  transition: opacity 3000ms ease;
  will-change: opacity;
  pointer-events: none;

  &.is-faded {
    opacity: 0;
  }
}

.hero-overlay__splash {
  position: absolute;
  inset: 0;
  z-index: 4;
  background-image: url('/landing/splash-dark.jpg');
  background-size: cover;
  background-position: center;
  filter: blur(128px);
  opacity: 1;
  transition: opacity 3000ms ease;
  will-change: opacity, transform, filter;
  pointer-events: none;
  isolation: isolate;

  &.is-faded {
    opacity: 0;
  }

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background-color: color-mix(in srgb, var(--color-accent) 55%, transparent);
    mix-blend-mode: color;
    pointer-events: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero-overlay__splash-base,
  .hero-overlay__splash {
    transition: none;
  }
}

.hero-overlay__body {
  pointer-events: auto;
  position: relative;
  z-index: 3;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  gap: 2rem;
  width: 100%;
}

.hero-overlay__text {
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  align-items: center;
  text-align: center;
  position: relative;
  z-index: 4;
  max-width: 720px;
  width: 100%;

  @media screen and (max-width: $breakpoint-l) {
    align-items: center;
    text-align: center;
  }
}

.hero-overlay__logo {
  width: 100%;
  pointer-events: none;
  user-select: none;

  @media screen and (max-width: $breakpoint-m) {
    padding-inline: 32px;
  }
}

.hero-overlay__title {
  font-size: clamp(17rem, 10vw, 10rem);
  font-stretch: ultra-condensed;
  font-weight: var(--font-weight-extrabold);
  letter-spacing: -1rem;
  transform: scaleY(0.6) translateX(-0.05em);
  line-height: clamp(4rem, 9vw, 8.5rem);
  margin-left: 30px;

  @media screen and (max-width: $breakpoint-m) {
    font-size: clamp(6rem, 16vw, 10rem);
    line-height: clamp(3.6rem, 13vw, 7.8rem);
    transform: scaleY(0.7) translateX(-0.04em);
    letter-spacing: 0;
    margin: 0;
    margin-left: 12px;
  }
}

.hero-overlay__stats {
  /* margin-top: 0.5rem; */
  width: 100%;
  position: relative;
  z-index: 4;
}

.hero-overlay :deep(.hero-section__actions),
.hero-overlay :deep(.hero-actions) {
  position: relative;
  z-index: 4;
  pointer-events: auto;
}

.hero-overlay :deep(.hero-section__stats) {
  position: relative;
  z-index: 4;
  pointer-events: auto;
}
</style>
