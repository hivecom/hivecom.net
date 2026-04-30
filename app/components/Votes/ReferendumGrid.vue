<script setup lang='ts'>
import type { Tables } from '@/types/database.overrides'
import { Grid, Skeleton } from '@dolanske/vui'

import ReferendumCard from '@/components/Shared/ReferendumCard.vue'
import { getReferendumStatus } from '@/lib/referendums'

const props = defineProps<{
  referendums: Tables<'referendums'>[]
  isLoading: boolean
  emptyTitle: string
  emptyMessage: string
  getVoteCount: (id: number) => number
  getVoterIds: (id: number) => string[]
  hasVoted: (id: number) => boolean
}>()
</script>

<template>
  <Grid v-if="props.isLoading" expand gap="m" class="referendum-cards-grid">
    <div v-for="n in 4" :key="`skeleton-${n}`" class="skeleton-card">
      <Skeleton :height="200" :radius="12" />
    </div>
  </Grid>

  <div v-else-if="props.referendums.length === 0" class="text-center p-xl">
    <Icon name="ph:user-sound" size="3rem" class="text-color-light mb-m" />
    <h3>{{ props.emptyTitle }}</h3>
    <p class="text-color-light">
      {{ props.emptyMessage }}
    </p>
  </div>

  <Grid v-else expand gap="m" class="referendum-cards-grid">
    <ReferendumCard
      v-for="referendum in props.referendums"
      :key="referendum.id"
      :referendum="referendum"
      :vote-count="props.getVoteCount(referendum.id)"
      :voter-ids="props.getVoterIds(referendum.id)"
      :status="getReferendumStatus(referendum)"
      :is-private="!referendum.is_public"
      :has-voted="props.hasVoted(referendum.id)"
    />
  </Grid>
</template>

<style lang="scss" scoped>
.referendum-cards-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-m);
  align-items: stretch;

  :deep(.referendum-card) {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .skeleton-card {
    min-height: 200px;
  }
}

@media (max-width: 768px) {
  .referendum-cards-grid {
    grid-template-columns: 1fr;
  }
}
</style>
