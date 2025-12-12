<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Button } from '@dolanske/vui'
import AnnouncementCard from '@/components/Announcements/AnnouncementCard.vue'

defineProps<{
  pinnedAnnouncements: Tables<'announcements'>[]
  loading: boolean
}>()

function scrollToPlatforms() {
  if (!import.meta.client)
    return
  const target = document.getElementById('platforms')
  if (!target)
    return

  const OFFSET = 240
  const top = target.getBoundingClientRect().top + window.scrollY - OFFSET
  window.scrollTo({ top, behavior: 'smooth' })
}
</script>

<template>
  <div class="hero-section__actions">
    <Button variant="fill" color="primary" @click="scrollToPlatforms">
      Join Community
    </Button>
    <Button variant="accent" @click="navigateTo('/community')">
      Learn More
    </Button>

    <div v-if="pinnedAnnouncements.length > 0 && !loading && pinnedAnnouncements[0]" class="hero-section__latest-announcement">
      <AnnouncementCard
        :announcement="pinnedAnnouncements[0]"
        :is-latest="true"
        ultra-compact
      />
    </div>
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

  @media screen and (max-width: $breakpoint-l) {
    justify-content: center;
  }
}

.hero-section__latest-announcement {
  .announcement-card {
    max-width: 350px;

    @media screen and (max-width: $breakpoint-s) {
      max-width: 100%;
      margin-top: var(--space-s);
    }
  }
}
</style>
