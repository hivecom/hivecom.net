<script setup lang="ts">
import type { Tables } from '@/types/database.types'

import { Badge, Card, Flex } from '@dolanske/vui'
import dayjs from 'dayjs'

import BulkAvatarDisplay from '@/components/Shared/BulkAvatarDisplay.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'

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
  isActive: boolean
  voterIds?: string[]
}

const props = defineProps<Props>()

// Calculate time remaining for active referendums
function getTimeRemaining(dateEnd: string) {
  const end = dayjs(dateEnd)
  const now = dayjs()
  const diff = end.diff(now)

  if (diff <= 0)
    return 'Concluded'

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

  if (days > 0)
    return `${days} day${days === 1 ? '' : 's'} left`
  if (hours > 0)
    return `${hours} hour${hours === 1 ? '' : 's'} left`
  return 'Less than 1 hour left'
}

// Navigate to referendum detail
function goToReferendum() {
  navigateTo(`/votes/${props.referendum.id}`)
}
</script>

<template>
  <Card
    class="referendum-card"
    role="button"
    @click="goToReferendum"
  >
    <Flex column gap="m" expand>
      <Flex x-between y-center expand>
        <h2 class="text-xl">
          {{ referendum.title }}
        </h2>
        <UserDisplay :user-id="referendum.created_by" size="s" />
      </Flex>

      <p v-if="referendum.description" class="text-color-light text-s line-clamp-2">
        {{ referendum.description }}
      </p>

      <Flex x-between y-center expand>
        <Flex column gap="xs">
          <Flex gap="xs">
            <Badge v-if="isActive" variant="info">
              {{ getTimeRemaining(referendum.date_end) }}
            </Badge>
            <Badge v-else variant="neutral">
              Concluded
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
          <span class="text-xs text-color-light">{{ voteCount }} vote{{ voteCount !== 1 ? 's' : '' }}</span>
          <BulkAvatarDisplay
            v-if="voterIds && voterIds.length > 0"
            :user-ids="voterIds"
            :max-users="3"
            :avatar-size="24"
            :random="true"
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
    transform: translateY(-2px);
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
