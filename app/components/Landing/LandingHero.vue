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

// Set on the globe's first frame so the planet ghost dissolves. The fallback timeout
// covers a globe that never readies (load failure, no WebGL).
const globeVisible = ref(false)
let ghostFallbackTimer: ReturnType<typeof setTimeout> | null = null

function handleGlobeReady() {
  globeVisible.value = true
  if (ghostFallbackTimer != null) {
    clearTimeout(ghostFallbackTimer)
    ghostFallbackTimer = null
  }
}

onMounted(() => {
  ghostFallbackTimer = setTimeout(() => {
    globeVisible.value = true
    ghostFallbackTimer = null
  }, 8000)
})

onBeforeUnmount(() => {
  if (ghostFallbackTimer != null) {
    clearTimeout(ghostFallbackTimer)
    ghostFallbackTimer = null
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
      <!-- Stand-in where the planet will render. Sits under the globe canvas
           so the planet fades up through it, then the ghost dissolves. -->
      <div class="hero-overlay__planet-ghost" :class="{ 'is-faded': globeVisible }" aria-hidden="true" />
      <ClientOnly>
        <LandingHeroGlobe @ready="handleGlobeReady" />
      </ClientOnly>

      <div class="hero-overlay__text">
        <h1 class="visually-hidden">
          Hivecom
        </h1>
        <!-- Inlined rather than an <img>. As a replaced image the wordmark gets
             rasterized to a bitmap, and the composited and direct paint paths
             don't agree on that bitmap when it's blown up from 308px to 720px,
             so the strokes change weight as the home swap fades it in. Inline
             it's real geometry and both paths draw the same thing. -->
        <svg
          class="hero-overlay__logo"
          viewBox="0 0 308 38"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path d="M35.0626 0.527776H48.669V37.4722H35.0626V24.8056H13.6064V37.4722H0V0.527776H13.6064V13.1944H35.0626V0.527776Z" fill="white" />
          <path d="M64.3543 0.527776V37.4722H50.7479V0.527776H64.3543Z" fill="white" />
          <path d="M101.5 0.527776H116.467L101.291 37.4722H81.0904L65.9141 0.527776H80.8811L91.1905 27.9722L101.5 0.527776Z" fill="white" />
          <path d="M156.269 11.0833H131.149V14.5139H156.269V23.4861H131.149V26.9167H156.269V37.4722H117.543V0.527776H156.269V11.0833Z" fill="white" />
          <path d="M157.291 18.9472C157.291 6.12222 164.199 0 180.317 0C194.97 0 202.611 5.17222 203.186 16.8361H189.266C188.743 13.3528 186.074 11.6111 180.317 11.6111C172.258 11.6111 170.897 15.0417 170.897 18.9472C170.897 22.9056 172.31 26.3889 180.317 26.3889C186.074 26.3889 188.743 24.5944 189.266 21.0583H203.186C202.611 32.775 195.023 38 180.317 38C164.199 38 157.291 31.825 157.291 18.9472Z" fill="white" />
          <path d="M227.283 38C211.165 38 204.257 31.825 204.257 18.9472C204.257 6.12222 211.165 0 227.283 0C243.349 0 250.309 6.175 250.309 18.9472C250.309 31.7722 243.349 38 227.283 38ZM227.283 26.3889C235.29 26.3889 236.703 22.8528 236.703 18.9472C236.703 15.0944 235.342 11.6111 227.283 11.6111C219.224 11.6111 217.863 15.0417 217.863 18.9472C217.863 22.9056 219.276 26.3889 227.283 26.3889Z" fill="white" />
          <path d="M308 0.527776V37.4722H294.394V19.8972L284.398 37.4722H275.502L265.506 19.8972V37.4722H251.9V0.527776H268.646L279.95 21.6389L291.254 0.527776H308Z" fill="white" />
        </svg>
      </div>

      <LandingHeroStats class="hero-overlay__stats" :community-stats="communityStats" :loading="loading" />
      <LandingMotd :fallback-text="splashMessage" />
      <LandingHeroActions />
    </div>
  </section>
</template>

<style scoped lang="scss">
:root.light {
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

// Stand-in disc matching the planet's on-screen size and position. The layer
// fills the hero exactly like the globe canvas and clips the same way, and the
// disc is sized off the layer height because that's what drives the planet's
// silhouette (globe.gl centers the globe; at altitude 1.9 with a 50deg vertical
// fov it spans ~79% of the container height, overflowing narrow viewports).
.hero-overlay__planet-ghost {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow: hidden;
  opacity: 1;
  transition: opacity 1800ms ease;
  will-change: opacity;
  pointer-events: none;

  &.is-faded {
    opacity: 0;
  }

  &::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    height: 79%;
    aspect-ratio: 1;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    // Shaded like the real planet: globe.gl's default directional light comes
    // from above, so the top rim catches light and the body falls into shadow.
    // Base tracks the globe material (--color-bg) nudged toward the dot color.
    background:
      radial-gradient(
        circle at 50% -35%,
        color-mix(in srgb, var(--color-border) 65%, transparent) 35%,
        transparent 70%
      ),
      color-mix(in srgb, var(--color-bg) 88%, var(--color-border));
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero-overlay__planet-ghost {
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
  // The viewBox carries the ratio, so height follows the width.
  height: auto;
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
