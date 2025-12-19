<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import LandingHeroActions from '@/components/Landing/LandingHeroActions.vue'
import LandingHeroGlobe from '@/components/Landing/LandingHeroGlobe.vue'
import LandingHeroShader from '@/components/Landing/LandingHeroShader.vue'
import LandingHeroStats from '@/components/Landing/LandingHeroStats.vue'
import LandingMotd from '@/components/Landing/LandingMotd.vue'

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
    <LandingHeroShader class="hero-overlay__shader" />
    <div class="hero-overlay__body">
      <ClientOnly>
        <LandingHeroGlobe />
      </ClientOnly>

      <div class="hero-overlay__text">
        <h1 class="hero-overlay__title">
          HIVECOM
        </h1>
        <LandingMotd fallback-text="A community of friends from all around the world" />
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

:root.light {
  .hero-overlay::after {
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
}

.hero-overlay {
  pointer-events: auto;
  position: relative;
  width: 100%;
  margin: 0 auto;
  min-height: 100vh;
  display: flex;
  align-items: stretch;

  &__shader {
    position: absolute;
    inset: 0;
    z-index: 0;
  }

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    opacity: 0.25;
    border-bottom: 1px solid var(--color-border-strong);
  }

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(
      circle at 50% 50%,
      rgba(0, 0, 0, 0.78) 0%,
      rgba(0, 0, 0, 0.7) 32%,
      rgba(0, 0, 0, 0.48) 55%,
      rgba(0, 0, 0, 0.12) 70%,
      transparent 82%
    );
    z-index: 1;
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
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: center;
  text-align: center;
  position: relative;
  z-index: 4;

  @media screen and (max-width: $breakpoint-l) {
    align-items: center;
    text-align: center;
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
  margin-top: 0.5rem;
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
