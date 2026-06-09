<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'

import { Badge, Card, Flex } from '@dolanske/vui'
import dayjs from 'dayjs'
import { computed } from 'vue'

import BulkAvatarDisplay from '@/components/Shared/BulkAvatarDisplay.vue'

import { formatDuration } from '@/lib/utils/duration'
import GlowCard from './GlowCard.vue'

type ReferendumStatus = 'active' | 'upcoming' | 'concluded'

interface Props {
  referendum: Tables<'referendums'> | {
    readonly choices: readonly string[]
    readonly created_at: string
    readonly created_by: string
    readonly date_end: string
    readonly date_start: string
    readonly description: string | null
    readonly id: number
    readonly modified_at: string
    readonly modified_by: string | null
    readonly multiple_choice: boolean
    readonly title: string
  }
  voteCount: number
  status: ReferendumStatus
  voterIds?: string[]
  isPrivate?: boolean
  /** Highlight that the current user voted in this vote */
  hasVoted?: boolean
}

const props = defineProps<Props>()

// Calculate time remaining for active votes
function getTimeRemaining(dateEnd: string) {
  const diff = dayjs(dateEnd).diff(dayjs())

  if (diff <= 0)
    return 'Concluded'

  const formatted = formatDuration(diff)
  return formatted ? `${formatted} left` : 'Less than 1 minute left'
}

const statusVariant = computed(() => {
  if (props.status === 'active')
    return 'info'
  if (props.status === 'upcoming')
    return 'warning'
  return 'neutral'
})

const statusText = computed(() => {
  if (props.status === 'active')
    return getTimeRemaining(props.referendum.date_end)
  if (props.status === 'upcoming')
    return 'Upcoming'
  return null
})

// Navigate to vote detail
function goToReferendum() {
  navigateTo(`/votes/${props.referendum.id}`)
}
</script>

<template>
  <GlowCard>
    <Card
      class="referendum-card card-bg"
      :class="{ 'referendum-card--private': isPrivate }"
      role="button"
      @click="goToReferendum"
    >
      <Flex column gap="m" expand>
        <h2 class="text-xxl referendum-card__title">
          {{ referendum.title }}
        </h2>

        <p v-if="referendum.description" class="text-color-light text-m line-clamp-3">
          {{ referendum.description }}
        </p>

        <Flex x-start y-center expand>
          <Flex column gap="xs">
            <Flex gap="xs" wrap>
              <Badge v-if="hasVoted" variant="accent" outline>
                <Icon name="ph:check" />
                Voted
              </Badge>

              <Badge v-if="statusText" :variant="statusVariant" outline>
                {{ statusText }}
              </Badge>

              <Badge v-if="referendum.multiple_choice" variant="neutral" outline>
                Multiple choice
              </Badge>
              <Badge v-else variant="neutral" outline>
                Single choice
              </Badge>
            </Flex>
          </Flex>

          <Flex gap="xs" y-center x-center>
            <BulkAvatarDisplay
              v-if="voterIds && voterIds.length > 0"
              :user-ids="voterIds"
              :max-users="5"
              :avatar-size="24"
              :random="true"
              :gap="4"
              cluster
            />
          </Flex>
        </Flex>
      </Flex>
    </Card>
  </GlowCard>
</template>

<style lang="scss" scoped>
@use '@/assets/mixins.scss' as *;
.referendum-card {
  transition: all 0.2s ease;
  cursor: pointer;
  // Container setup
  container-type: inline-size; // We monitor the inline size (horizontal)
  container-name: card; // We name the container to specifically select it

  :deep(.vui-card-content) {
    display: flex;
    height: 100%;
    flex-direction: column;

    & > .vui-flex {
      flex: 1;
    }

    p {
      flex: 1;
    }
  }

  &:hover {
    background-color: var(--color-bg-lowered);
    box-shadow: var(--shadow-m);
  }

  &__lock-icon {
    color: var(--color-text-lighter);
    font-size: var(--font-size-m);
    flex-shrink: 0;
  }

  .line-clamp-3 {
    @include line-clamp(3);
  }

  // Ensure UserDisplay component displays inline properly
  .user-display {
    display: inline-flex;
  }
}

// When card itself is less than 456px, apply these styles
@container card (max-width: 456px) {
  .referendum-card__title {
    flex-wrap: wrap !important;
  }
}
</style>
