<script setup lang="ts">
import { Button } from '@dolanske/vui'
import GlowCard from '@/components/Shared/GlowCard.vue'

function scrollToPlatforms() {
  if (!import.meta.client)
    return
  const target = document.querySelector('.page-landing')
  if (!target)
    return

  const top = target.getBoundingClientRect().top - 64
  window.scrollTo({ top, behavior: 'smooth' })
}
</script>

<template>
  <div class="hero-section__actions">
    <GlowCard halo>
      <Button size="l" square variant="link" @click="scrollToPlatforms">
        <Icon name="mdi:arrow-down" />
      </Button>
    </GlowCard>
  </div>
</template>

<style lang="scss">
@use '@/assets/breakpoints.scss' as *;

.hero-section__actions {
  display: flex;
  gap: 1rem;
  justify-content: start;
  align-items: center;
  flex-wrap: wrap;
  padding-bottom: var(--space-l);

  @media screen and (max-width: $breakpoint-l) {
    justify-content: center;
  }
}
</style>
