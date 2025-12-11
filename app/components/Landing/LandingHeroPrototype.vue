<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import LandingHeroActions from '@/components/Landing/LandingHeroActions.vue'
import LandingHeroGlobe from '@/components/Landing/LandingHeroGlobe.vue'
import LandingHeroStats from '@/components/Landing/LandingHeroStats.vue'

interface CommunityStats {
  members: number
  membersAccurate: boolean
  gameservers: number
  age: number
  projects: number
}

defineProps<{
  pinnedAnnouncements: Tables<'announcements'>[]
  communityStats: CommunityStats
  loading: boolean
}>()
</script>

<template>
  <section class="hero-overlay">
    <div class="hero-overlay__body">
      <ClientOnly>
        <LandingHeroGlobe />
      </ClientOnly>
      <div class="hero-overlay__text">
        <h1 class="hero-overlay__title">
          HIVECOM
        </h1>
        <p class="hero-overlay__tagline">
          A community of friends from all around the world
        </p>
      </div>

      <LandingHeroStats class="hero-overlay__stats" :community-stats="communityStats" :loading="loading" />
      <LandingHeroActions :pinned-announcements="pinnedAnnouncements" :loading="loading" />
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '@/assets/breakpoints.scss' as *;

:root.dark {
  .hero-overlay::before {
    opacity: 0.01;
  }
}

.hero-overlay {
  pointer-events: none;
  position: relative;
  width: 100%;
  margin: 0 auto;
  min-height: 100vh;
  display: flex;
  align-items: stretch;
  padding: clamp(3rem, 6vw, 6rem) 0 clamp(2.5rem, 6vw, 5rem);

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    opacity: 0.25;
    border-bottom: 1px solid var(--color-border-strong);
  }
}

.hero-overlay__body {
  pointer-events: auto;
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  gap: 2rem;
  width: 100%;
}

.hero-overlay__text {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: center;
  text-align: center;

  @media screen and (max-width: $breakpoint-l) {
    align-items: center;
    text-align: center;
  }
}

.hero-overlay__title {
  font-size: clamp(4.5rem, 10vw, 10rem);
  font-stretch: ultra-condensed;
  font-weight: var(--font-weight-black);
  letter-spacing: -0.05em;
  transform: scaleY(0.85) translateX(-0.05em);
  line-height: clamp(4rem, 9vw, 8.5rem);
  margin: 0;
}

.hero-overlay__tagline {
  font-size: var(--font-size-l);
  margin: 0;
  opacity: 0.82;
}

.hero-overlay__stats {
  margin-top: 0.5rem;
  width: 100%;
}
</style>
