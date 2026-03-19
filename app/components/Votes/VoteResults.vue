<script setup lang='ts'>
import type { Tables } from '@/types/database.overrides'
import { Button, Card, Flex, Skeleton, Tooltip } from '@dolanske/vui'

import Discussion from '@/components/Discussions/Discussion.vue'
import ReferendumResults from '@/components/Shared/ReferendumResults.vue'

import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{
  referendum: Tables<'referendums'>
  votes: Tables<'referendum_votes'>[]
  shouldShowResults: boolean
  isLoadingResults: boolean
  isActive: boolean
}>()

const emit = defineEmits<{
  requestRevealResults: []
}>()

const isBelowSmall = useBreakpoint('<s')
</script>

<template>
  <section>
    <!-- Hidden results message -->
    <Card
      v-if="!props.shouldShowResults"
      :class="{ 'p-l': !isBelowSmall }"
    >
      <Flex x-between y-center>
        <h3>
          Results
        </h3>
        <Tooltip :style="{ maxWidth: '324px' }">
          <Button
            v-if="props.isActive"
            variant="gray"
            @click="emit('requestRevealResults')"
          >
            <template #start>
              <Icon name="ph:eye" />
            </template>
            Reveal
          </Button>
          <template #tooltip>
            <p>Cast your vote to see the current results, or reveal them early using the button above.</p>
          </template>
        </Tooltip>
      </Flex>
    </Card>

    <!-- Loading results -->
    <Card v-else-if="props.isLoadingResults" :class="{ 'p-l': !isBelowSmall }">
      <Flex x-between y-center class="mb-m">
        <Skeleton :width="80" :height="24" :radius="4" />
      </Flex>
      <div class="results-skeleton">
        <div v-for="n in 3" :key="n" class="result-skeleton">
          <Flex x-between y-center class="mb-xs">
            <Skeleton :width="150" :height="16" :radius="4" />
            <Skeleton :width="60" :height="16" :radius="4" />
          </Flex>
          <Skeleton :height="8" :radius="4" class="mb-xs" />
          <Skeleton :width="40" :height="14" :radius="4" />
        </div>
      </div>
    </Card>

    <!-- Actual results -->
    <ReferendumResults
      v-else
      :referendum="props.referendum"
      :votes="props.votes"
    />

    <h3 class="mt-m mb-m">
      Comments
    </h3>
    <Discussion
      :id="String(props.referendum.id)"
      type="referendum"
      hash="general-chat"
    />
  </section>
</template>

<style lang="scss" scoped>
.results-skeleton {
  .result-skeleton {
    margin-bottom: var(--space-l);

    &:last-child {
      margin-bottom: 0;
    }
  }
}
</style>
