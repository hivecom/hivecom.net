<script setup lang="ts">
import type { Tables } from '@/types/database.types'

import { Badge, Card, Flex } from '@dolanske/vui'
import dayjs from 'dayjs'
import { computed } from 'vue'

import BulkAvatarDisplay from '@/components/Shared/BulkAvatarDisplay.vue'

import UserDisplay from '@/components/Shared/UserDisplay.vue'
import { formatDuration } from '@/lib/utils/duration'

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
}

const props = defineProps<Props>()

// Calculate time remaining for active referendums
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
  return 'Concluded'
})

// Navigate to referendum detail
function goToReferendum() {
  navigateTo(`/votes/${props.referendum.id}`)
}
</script>

<template>
  <Card
    class="referendum-card card-bg"
    role="button"
    @click="goToReferendum"
  >
    <Flex column gap="m" expand>
      <Flex x-between y-center expand gap="l" wrap>
        <h2 class="text-xxl">
          {{ referendum.title }}
        </h2>
        <UserDisplay :user-id="referendum.created_by" size="s" />
      </Flex>

      <p v-if="referendum.description" class="text-color-light text-m mb-l line-clamp-3">
        {{ referendum.description }}
      </p>

      <Flex x-start y-center expand>
        <Flex column gap="xs">
          <Flex gap="xs">
            <Badge :variant="statusVariant">
              {{ statusText }}
            </Badge>
            <Badge v-if="referendum.multiple_choice" variant="neutral">
              Multiple choice
            </Badge>
            <Badge v-else variant="neutral">
              Single choice
            </Badge>
          </Flex>
        </Flex>

        <Flex gap="xs" y-center x-center>
          <BulkAvatarDisplay
            v-if="voterIds && voterIds.length > 0"
            :user-ids="voterIds"
            :max-users="3"
            :avatar-size="24"
            :random="true"
            :gap="4"
          />
        </Flex>
      </Flex>
    </Flex>
  </Card>
</template>

<style lang="scss" scoped>
.referendum-card {
  transition: all 0.2s ease;
  cursor: pointer;

  &:hover {
    background-color: var(--color-bg-lowered);
    box-shadow: var(--shadow-m);
  }

  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  // Ensure UserDisplay component displays inline properly
  .user-display {
    display: inline-flex;
  }
}
</style>
