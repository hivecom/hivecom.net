<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Accordion, Button, Card, Flex } from '@dolanske/vui'
import { computed } from 'vue'
import { useBreakpoint } from '@/lib/mediaQuery'
import { md5 } from '@/lib/utils/hash'
import Discussion from '../Discussions/Discussion.vue'
import BulkAvatarDisplay from './BulkAvatarDisplay.vue'

interface VoteResult {
  choice: string
  index: number
  count: number
  percentage: number
  users: string[]
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
    users: [] as VoteResult['users'],
  }))

  // Count votes for each choice
  props.votes.forEach((vote) => {
    vote.choices.forEach((choiceIndex) => {
      if (results[choiceIndex]) {
        results[choiceIndex].count++
        results[choiceIndex].users.push(vote.user_id)
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

function handleRevealResults() {
  emit('revealResults')
}

const isBelowSmall = useBreakpoint('<s')
</script>

<template>
  <Card class="card-bg" :class="{ 'p-l': !isBelowSmall }">
    <Flex x-between y-center class="mb-l">
      <h3>
        Results
      </h3>
      <Flex gap="s">
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
      <Accordion
        v-for="result in voteResults" :key="result.index"
        unstyled
      >
        <template #trigger="{ toggle, isOpen }">
          <button
            class="result-item result-item--comments"
            :class="{ 'result-item--votes': result.percentage > 0 }"
            @click="toggle()"
          >
            <Flex x-between y-center>
              <span class="result-item__choice">{{ result.choice }} <span class="result-item__percentage">{{ `(${result.percentage.toFixed()}%)` }}</span></span>
              <Icon name="ph:chat-circle-dots" class="result-item__comments-count" :size="18" />
              <BulkAvatarDisplay
                v-if="result.users.length > 0"
                :user-ids="result.users"
                :max-users="3"
                :avatar-size="24"
                :random="true"
                :gap="4"
                no-empty-state
              />
              <span v-if="result.count === 0" class="result-item__count">{{ result.count }} votes</span>
              <Icon :name="`ph:caret-${isOpen ? 'up' : 'down'}`" />
            </Flex>

            <div
              class="result-item__indicator"
              :style="{
                width: `${result.percentage}%`,
                opacity: Math.min(Math.max(0.1, result.percentage / 200), 0.8),
              }"
            />
          </button>
        </template>

        <div class="result-comments">
          <Discussion
            :id="String(props.referendum.id)"
            type="event"
            :hash="md5(result.choice)"
            :input-rows="2"
            :empty-message="false"
          />
        </div>
      </Accordion>
    </div>
  </Card>
</template>

<style lang="scss" scoped>
@use '@/assets/breakpoints.scss' as *;

.results-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

:root.light {
  .result-item--comments:hover {
    background-color: var(--color-bg);
  }

  .result-item__count,
  .result-item__choice {
    opacity: 0.75;
  }

  .result-comments {
    background-color: var(--color-bg-medium);
  }
}

:deep(.vui-accordion):has(.discussion-comment) {
  .result-item__comments-count {
    display: block;
  }
}

.result-item {
  padding: 0 var(--space-m);
  position: relative;
  height: 56px;
  z-index: 1;
  width: 100%;
  transition: var(--transition-fast);
  border-radius: var(--border-radius-m);
  cursor: default;

  &--comments {
    cursor: pointer;

    &:hover {
      background-color: var(--color-button-gray-hover);
    }
  }

  &--votes {
    .result-item__choice {
      color: var(--color-text);
    }
  }

  &__choice {
    font-weight: var(--font-weight-medium);
    line-height: 1.3em;
    padding-right: 128px;
    text-align: left;
    flex: 1;
    color: var(--color-text-lighter);

    @media (max-width: $breakpoint-s) {
      padding-right: 16px;
    }
  }

  &__count {
    color: var(--color-text-lighter);
    font-size: var(--font-size-s);
    white-space: nowrap;
  }

  &__comments-count {
    display: none;
  }

  &__indicator {
    position: absolute;
    display: block;
    inset: 0;
    right: unset;
    background-color: var(--color-bg-accent-lowered);
    z-index: -1;
    border-radius: var(--border-radius-m);
  }

  &__percentage {
    font-size: var(--font-size-s);
    display: inline;
    opacity: 0.65;
    padding-left: 4px;
    vertical-align: middle;
  }
}

:deep(.vui-accordion-content) {
  margin-top: 4px;

  &[aria-hidden='false'] {
    margin-bottom: var(--space-m);
  }
}

.result-comments {
  padding: var(--space-s);
  background-color: var(--color-bg-raised);
  border-radius: var(--border-radius-m);
  display: flex;
  flex-direction: column;
  gap: var(--space-m);

  :deep(.vui-avatar) {
    background-color: var(--color-bg) !important;
  }

  :deep(textarea) {
    background-color: var(--color-bg-medium) !important;
  }

  :deep(.discussion-comment) {
    margin-top: -16px;
  }
}
</style>
