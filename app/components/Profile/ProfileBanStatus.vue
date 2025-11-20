<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Card, Flex } from '@dolanske/vui'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { formatDuration } from '@/lib/utils/duration'

interface Props {
  profile: Tables<'profiles'>
}

const props = defineProps<Props>()

// Function to check if ban is active
function isBanActive() {
  if (!props.profile.banned)
    return false

  // If no end date, it's a permanent ban
  if (!props.profile.ban_end)
    return true

  // Check if ban end date is in the future
  const banEndDate = new Date(props.profile.ban_end)
  const now = new Date()
  return banEndDate > now
}

// Function to format ban duration
function getBanDuration() {
  if (!props.profile.ban_start)
    return ''

  const banStart = new Date(props.profile.ban_start)

  if (!props.profile.ban_end) {
    return `Permanently banned since ${banStart.toLocaleDateString()}`
  }

  const banEnd = new Date(props.profile.ban_end)
  const now = new Date()

  // Calculate the duration between start and end
  const durationMs = banEnd.getTime() - banStart.getTime()
  const durationText = formatDuration(durationMs)

  if (banEnd <= now) {
    return `Was banned for ${durationText}`
  }

  return `Banned for ${durationText}`
}

// Function to get ban end date for TimestampDate component
function getBanEndDate() {
  return props.profile.ban_end || null
}
</script>

<template>
  <Card v-if="profile.banned" class="ban-status-card" :class="{ 'ban-expired': !isBanActive() }">
    <Flex gap="m" y-center>
      <Icon
        :name="isBanActive() ? 'ph:warning-circle-fill' : 'ph:clock-fill'"
        size="24"
        class="ban-icon"
      />
      <Flex column gap="xs" expand>
        <h3 class="ban-title">
          {{ isBanActive() ? 'This user has been banned' : 'This user was previously banned' }}
        </h3>
        <p v-if="profile.ban_reason" class="ban-reason">
          <strong>Reason:</strong> {{ profile.ban_reason }}
        </p>
        <p class="text-s text-color-light">
          {{ getBanDuration() }}
          <span v-if="getBanEndDate() && isBanActive()" class="text-xs text-color-lighter">
            - expires <TimestampDate :date="getBanEndDate()!" size="xs" relative />
          </span>
          <span v-else-if="getBanEndDate() && !isBanActive()" class="text-xs text-color-lighter">
            - expired <TimestampDate :date="getBanEndDate()!" size="xs" relative />
          </span>
        </p>
      </Flex>
    </Flex>
  </Card>
</template>

<style lang="scss" scoped>
.ban-status-card {
  border: 2px solid var(--text-color-red);
  background: var(--color-bg-danger);

  &.ban-expired {
    border: 2px solid var(--text-color-orange);
    background: var(--color-bg-warning);

    .ban-icon {
      color: var(--text-color-orange);
    }

    .ban-title {
      color: var(--text-color-orange);
    }

    .ban-reason strong {
      color: var(--text-color-orange);
    }
  }

  .ban-icon {
    color: var(--text-color-red);
    flex-shrink: 0;
  }

  .ban-title {
    margin: 0;
    font-size: var(--font-size-l);
    font-weight: var(--font-weight-bold);
    color: var(--text-color-red);
  }

  .ban-reason {
    margin: 0;
    color: var(--text-color);
    font-size: var(--font-size-s);

    strong {
      color: var(--text-color-red);
    }
  }
}
</style>
