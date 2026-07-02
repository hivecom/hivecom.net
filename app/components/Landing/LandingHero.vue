<script setup lang="ts">
import type { MetricsSnapshot } from '@/types/metrics'
import { defineAsyncComponent, onBeforeUnmount } from 'vue'
import constants from '~~/constants.json'
import LandingHeroActions from '@/components/Landing/LandingHeroActions.vue'
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

// When mounted from the dashboard peek, the page already animates in, so we skip
// the splash and let the globe fade up on its own.
const props = withDefaults(defineProps<{
  skipSplash?: boolean
}>(), {
  skipSplash: false,
})

const loading = ref(true)
const errorMessage = ref('')

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

const splashMessage = ref(constants.SPLASH_MESSAGE)

// Splash fades out when the globe signals it has rendered its first frame.
// Fallback timeout covers the case where the globe fails to load entirely or
// takes pathologically long, so users are never stuck looking at a placeholder.
const globeReady = ref(props.skipSplash)
let splashFallbackTimer: ReturnType<typeof setTimeout> | null = null

function handleGlobeReady() {
  globeReady.value = true
  if (splashFallbackTimer != null) {
    clearTimeout(splashFallbackTimer)
    splashFallbackTimer = null
  }
}

onMounted(() => {
  if (props.skipSplash)
    return
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
    splashMessage.value = constants.SPLASH_MESSAGE
    return
  }

  const rawChance = typeof constants.SPLASH_ALTERNATIVES_CHANCE === 'number'
    ? constants.SPLASH_ALTERNATIVES_CHANCE
    : 0
  const chance = Math.min(1, Math.max(0, Number.isFinite(rawChance) ? rawChance : 0))

  if (Math.random() >= chance) {
    splashMessage.value = constants.SPLASH_MESSAGE
    return
  }

  const idx = Math.floor(Math.random() * alternatives.length)
  splashMessage.value = alternatives[idx] ?? constants.SPLASH_MESSAGE
})
</script>

<template>
  <section class="hero-overlay">
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
