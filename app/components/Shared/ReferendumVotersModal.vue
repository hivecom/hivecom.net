<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Alert, Badge, Button, Flex, Modal, Skeleton } from '@dolanske/vui'
import { computed, ref } from 'vue'
import BulkUserDisplay from '@/components/Shared/BulkUserDisplay.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

interface Props {
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
  open: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

// Modal state
const isOpen = defineModel<boolean>('open', { default: false })
const isBelowSmall = useBreakpoint('<xs')

// Loading state (for consistency with RSVP modal pattern)
const loading = ref(false)
const error = ref('')

// Local state for toggling vote details visibility - defaults to false for privacy
const showDetailsLocally = ref(false)

// Computed voter data
const voterData = computed(() => {
  if (!props.votes)
    return []

  return props.votes.map(vote => ({
    userId: vote.user_id,
    choices: vote.choices,
    comment: vote.comment,
    votedAt: vote.created_at,
  }))
})

// Get unique voter IDs for BulkUserDisplay
const voterIds = computed(() => {
  return voterData.value.map(voter => voter.userId)
})

// Total count
const totalCount = computed(() => voterData.value.length)

// Get vote choices as readable text
function getVoteChoicesText(choices: readonly number[]): string {
  if (!props.referendum?.choices)
    return 'Unknown'

  return choices
    .map(choiceIndex => props.referendum.choices[choiceIndex])
    .filter(Boolean)
    .join(', ')
}

// Toggle vote details visibility
function toggleDetails() {
  showDetailsLocally.value = !showDetailsLocally.value
}

function handleClose() {
  isOpen.value = false
  emit('close')
}
</script>

<template>
  <Modal :open="isOpen" centered :size="isBelowSmall ? 'screen' : undefined" @close="handleClose">
    <template #header>
      <Flex x-between y-center expand>
        <h3>Voters</h3>
        <Flex gap="s" y-center>
          <!-- Toggle details button -->
          <Button
            v-if="totalCount > 0"
            variant="gray"
            size="s"
            @click="toggleDetails"
          >
            <template #start>
              <Icon :name="showDetailsLocally ? 'ph:eye-slash' : 'ph:eye'" />
            </template>
            {{ showDetailsLocally ? 'Hide Details' : 'Show Details' }}
          </Button>

          <Badge v-if="!loading && totalCount > 0" variant="neutral">
            {{ totalCount }} {{ totalCount === 1 ? 'voter' : 'voters' }}
          </Badge>
        </Flex>
      </Flex>
    </template>

    <div class="voters-modal-content">
      <!-- Loading State -->
      <div v-if="loading" class="voters-modal__loading">
        <Flex column gap="m">
          <Skeleton height="2rem" width="100%" />
          <Skeleton height="1rem" width="80%" />
          <Skeleton height="1rem" width="60%" />
          <Skeleton height="1rem" width="90%" />
        </Flex>
      </div>

      <!-- Error State -->
      <Alert v-else-if="error" variant="danger">
        {{ error }}
      </Alert>

      <!-- Content -->
      <div v-else>
        <!-- No voters State -->
        <div v-if="totalCount === 0" class="voters-modal__empty">
          <Flex column y-center x-center gap="m">
            <Icon name="ph:vote" size="48" class="voters-modal__empty-icon" />
            <h4>No votes yet</h4>
            <p class="text-color-light text-center">
              Be the first to vote on this referendum!
            </p>
          </Flex>
        </div>

        <!-- Voters List -->
        <div v-else class="voters-modal__content">
          <!-- Show vote details header if enabled -->
          <div v-if="showDetailsLocally && totalCount > 0" class="voters-modal__header">
            <p class="text-color-light text-s">
              <Icon name="ph:eye" class="mr-xs" />
              Vote selections are visible
            </p>
          </div>

          <!-- Custom user display with vote details -->
          <div v-if="showDetailsLocally" class="voters-modal__detailed-list">
            <div
              v-for="voter in voterData"
              :key="voter.userId"
              class="voters-modal__voter-item"
            >
              <Flex x-between y-start gap="m">
                <!-- User info -->
                <div class="voters-modal__user-info">
                  <UserDisplay
                    :user-id="voter.userId"
                    size="s"
                    :show-role="false"
                  />
                </div>

                <!-- Vote details -->
                <div class="voters-modal__vote-details">
                  <div class="voters-modal__vote-choices">
                    <span class="text-color-light text-xs">Voted for:</span>
                    <span class="voters-modal__choices-text">
                      {{ getVoteChoicesText(voter.choices) }}
                    </span>
                  </div>

                  <div v-if="voter.comment" class="voters-modal__vote-comment">
                    <span class="text-color-light text-xs">Comment:</span>
                    <span class="voters-modal__comment-text">
                      "{{ voter.comment }}"
                    </span>
                  </div>
                </div>
              </Flex>
            </div>
          </div>

          <!-- Simple user list without vote details -->
          <BulkUserDisplay
            v-else
            :user-ids="voterIds"
            :columns="2"
            gap="s"
            :expand="true"
            user-size="s"
            item-class="voters-modal__user-item"
          />
        </div>
      </div>
    </div>

    <template #footer>
      <Flex gap="xs" x-end expand>
        <Button variant="gray" :expand="isBelowSmall" @click="handleClose">
          Close
        </Button>
      </Flex>
    </template>
  </Modal>
</template>

<style lang="scss" scoped>
.voters-modal-content {
  min-height: 300px;
  max-height: 500px;
  overflow-y: auto;
}

.voters-modal__loading {
  padding: var(--space-l);
}

.voters-modal__empty {
  padding: var(--space-xl);
  text-align: center;

  &-icon {
    color: var(--color-text-light);
  }

  h4 {
    margin: 0;
    color: var(--color-text);
  }

  p {
    margin: 0;
    font-size: var(--font-size-s);
  }
}

.voters-modal__header {
  margin-bottom: var(--space-m);
  padding: var(--space-s);
  background: var(--color-bg-subtle);
  border-radius: var(--border-radius-s);
  border: 1px solid var(--color-border);

  p {
    margin: 0;
    display: flex;
    align-items: center;
  }
}

.voters-modal__detailed-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
}

.voters-modal__voter-item {
  padding: var(--space-m);
  border-radius: var(--border-radius-s);
  border: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
  transition: background-color 0.2s ease;

  &:hover {
    background: var(--color-bg-raised);
  }
}

.voters-modal__user-info {
  flex-shrink: 0;
  min-width: 150px;
}

.voters-modal__vote-details {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  min-width: 0; // Allow text to wrap
}

.voters-modal__vote-choices {
  display: flex;
  flex-direction: column;
  gap: var(--space-xxs);
}

.voters-modal__choices-text {
  font-weight: 500;
  word-wrap: break-word;
}

.voters-modal__vote-comment {
  display: flex;
  flex-direction: column;
  gap: var(--space-xxs);
}

.voters-modal__comment-text {
  font-style: italic;
  word-wrap: break-word;
  color: var(--color-text-light);
}

.voters-modal__user-item {
  padding: var(--space-s);
  border-radius: var(--border-radius-s);
  border: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
  transition: background-color 0.2s ease;

  &:hover {
    background: var(--color-bg-raised);
  }
}

// Responsive adjustments
@media (max-width: 768px) {
  .voters-modal__voter-item {
    .voters-modal__user-info {
      min-width: 120px;
    }
  }
}
</style>
