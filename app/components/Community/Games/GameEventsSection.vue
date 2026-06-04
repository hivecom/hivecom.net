<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Grid, Skeleton } from '@dolanske/vui'
import { computed } from 'vue'
import GameEventCard from '@/components/Community/Games/GameEventCard.vue'
import GlowGroup from '@/components/Shared/GlowGroup.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{
  events: Tables<'events'>[]
  loading: boolean
  games: Tables<'games'>[]
}>()

const isMobile = useBreakpoint('<s')

const gameEvents = computed(() => {
  const nowMs = Date.now()

  const withGames = props.events.filter(e => (e.games?.length ?? 0) > 0)

  const getStatus = (e: Tables<'events'>) => {
    const start = new Date(e.date).getTime()
    const end = e.duration_minutes ? start + e.duration_minutes * 60 * 1000 : start
    if (nowMs >= start && nowMs <= end)
      return 'ongoing'
    if (start > nowMs)
      return 'upcoming'
    return 'past'
  }

  const ongoing = withGames
    .filter(e => getStatus(e) === 'ongoing')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const upcoming = withGames
    .filter(e => getStatus(e) === 'upcoming')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const past = withGames
    .filter(e => getStatus(e) === 'past')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return [...ongoing, ...upcoming, ...past].slice(0, 3)
})
</script>

<template>
  <!-- Loading: 3 card skeletons -->
  <template v-if="loading">
    <Grid :columns="isMobile ? 1 : 3" gap="m">
      <Skeleton v-for="i in 3" :key="i" :height="160" :radius="8" />
    </Grid>
  </template>

  <!-- No events: render nothing -->
  <template v-else-if="gameEvents.length === 0" />

  <!-- Events grid -->
  <template v-else>
    <GlowGroup>
      <Grid :columns="isMobile ? 1 : 3" gap="m" align="stretch" class="game-events-grid">
        <GameEventCard
          v-for="event in gameEvents"
          :key="event.id"
          :event="event"
          :games="games"
          hide-description
        />
      </Grid>
    </GlowGroup>
  </template>
</template>

<style lang="scss" scoped>
.game-events-grid {
  // All cards stretch to the height of the tallest
  :deep(.vui-grid) {
    align-items: stretch;
  }

  :deep(.event-card) {
    height: 100%;
  }
}
</style>
