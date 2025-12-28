<script setup lang="ts">
import type { Tables } from '@/types/database.types'

import { Button, Card, Flex } from '@dolanske/vui'
import { computed, ref } from 'vue'
import ReferendumVotersModal from '@/components/Shared/ReferendumVotersModal.vue'

interface VoteResult {
  choice: string
  index: number
  count: number
  percentage: number
}

const props = defineProps<{
  referendum: Tables<'referendums'> | {
    readonly id: number
    readonly title: string
    readonly choices: readonly string[]
    readonly multiple_choice: boolean
    readonly created_at: string
    readonly created_by: string
    readonly date_end: string
    readonly date_start: string
    readonly description: string | null
    readonly modified_at: string
    readonly modified_by: string | null
  }
  votes: Tables<'referendum_votes'>[] | readonly Tables<'referendum_votes'>[] | readonly {
    readonly choices: readonly number[]
    readonly comment: string | null
    readonly created_at: string
    readonly id: number
    readonly modified_at: string | null
    readonly referendum_id: number | null
    readonly user_id: string
  }[]
  showRevealButton?: boolean
  canRevealResults?: boolean
}>()

const emit = defineEmits<{
  revealResults: []
}>()

// Calculate vote results
const voteResults = computed<VoteResult[]>(() => {
  if (!props.referendum || !props.votes) {
    return []
  }

  const results = props.referendum.choices.map((choice, index) => ({
    choice,
    index,
    count: 0,
    percentage: 0,
  }))

  // Count votes for each choice
  props.votes.forEach((vote) => {
    vote.choices.forEach((choiceIndex) => {
      if (results[choiceIndex]) {
        results[choiceIndex].count++
      }
    })
  })

  // Calculate percentages
  const totalVotes = props.votes.length
  results.forEach((result) => {
    result.percentage = totalVotes > 0 ? (result.count / totalVotes) * 100 : 0
  })

  return results
})

const totalVoters = computed(() => props.votes?.length || 0)

// Voters modal state
const showVotersModal = ref(false)

function handleRevealResults() {
  emit('revealResults')
}
</script>

<template>
  <Card class="p-l card-bg">
    <Flex x-between y-center class="mb-m">
      <h3>
        Results
      </h3>
      <Flex gap="s">
        <!-- View voters button -->
        <Button
          v-if="totalVoters > 0"
          variant="gray"
          size="s"
          @click="showVotersModal = true"
        >
          <template #start>
            <Icon name="ph:users" />
          </template>
          {{ totalVoters }} {{ totalVoters === 1 ? 'Voter' : 'Voters' }}
        </Button>

        <!-- Show reveal button if conditions are met -->
        <Button
          v-if="showRevealButton && canRevealResults"
          variant="gray"
          size="s"
          @click="handleRevealResults"
        >
          <template #start>
            <Icon name="ph:eye" />
          </template>
          Reveal Results
        </Button>
      </Flex>
    </Flex>

    <!-- No votes yet -->
    <div v-if="totalVoters === 0" class="text-center p-l">
      <Icon name="ph:chart-bar" size="2rem" class="text-color-light mb-s" />
      <p class="text-color-light">
        No votes yet
      </p>
    </div>

    <!-- Results list -->
    <div v-else class="results-list">
      <div
        v-for="result in voteResults"
        :key="result.index"
        class="result-item"
      >
        <Flex x-between y-center class="mb-xs">
          <span class="choice-text">{{ result.choice }}</span>
          <span class="vote-count">{{ result.count }} vote{{ result.count !== 1 ? 's' : '' }}</span>
        </Flex>

        <div class="progress-bar">
          <div
            class="progress-fill"
            :style="{ width: `${result.percentage}%` }"
          />
        </div>

        <span class="percentage">{{ result.percentage.toFixed(1) }}%</span>
      </div>
    </div>
  </Card>

  <!-- Voters Modal -->
  <ReferendumVotersModal
    v-model:open="showVotersModal"
    :referendum="referendum"
    :votes="votes"
    @close="showVotersModal = false"
  />
</template>

<style lang="scss" scoped>
.results-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-l);
}

.result-item {
  .choice-text {
    font-weight: 500;
  }

  .vote-count {
    color: var(--color-text-light);
    font-size: var(--font-size-s);
  }

  .progress-bar {
    height: 8px;
    background-color: var(--color-bg-lowered);
    border-radius: var(--border-radius-s);
    overflow: hidden;
    margin: var(--space-xs) 0;

    .progress-fill {
      height: 100%;
      background-color: var(--color-accent);
      transition: width 0.3s ease;
    }
  }

  .percentage {
    color: var(--color-text-light);
    font-size: var(--font-size-s);
    font-weight: 500;
  }
}
</style>
