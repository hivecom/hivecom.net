<script setup lang="ts">
import { Button } from '@dolanske/vui'

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
    <Button size="l" variant="accent" @click="scrollToPlatforms">
      Learn more
    </Button>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/breakpoints.scss' as *;

.hero-section__actions {
  display: flex;
  gap: 1rem;
  justify-content: start;
  align-items: center;
  flex-wrap: wrap;
  padding-bottom: var(--space-xxl);

  .vui-button {
    width: 192px;
  }

  @media screen and (max-width: $breakpoint-l) {
    justify-content: center;
  }
}
</style>
