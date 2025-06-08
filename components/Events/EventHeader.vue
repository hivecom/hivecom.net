<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Badge, Button, Flex, Tooltip } from '@dolanske/vui'
import TimestampDate from '~/components/Shared/TimestampDate.vue'
import { formatDurationFromMinutes } from '~/utils/duration'
import CountdownTimer from './CountdownTimer.vue'

interface Props {
  event: Tables<'events'>
  isUpcoming: boolean
  isOngoing?: boolean
  countdown?: {
    days: number
    hours: number
    minutes: number
    seconds: number
  } | null
  timeAgo?: string
}

defineProps<Props>()
</script>

<template>
  <div class="event-header">
    <!-- Title and actions row -->
    <Flex x-between align="start" gap="l" class="event-header__title-row">
      <div class="event-header__title-section">
        <h1 class="event-header__title">
          {{ event.title }}
        </h1>
        <p v-if="event.description" class="event-header__description">
          {{ event.description }}
        </p>
      </div>

      <!-- Timing/Countdown Section -->
      <div class="event-header__timing-section">
        <!-- Enhanced Countdown for upcoming events or NOW for ongoing -->
        <CountdownTimer
          v-if="isUpcoming || isOngoing"
          :countdown="countdown"
          :is-ongoing="isOngoing"
        />

        <!-- Time ago for past events -->
        <div v-else-if="!isUpcoming && !isOngoing && timeAgo" class="event-header__time-ago-compact">
          <span class="event-header__time-ago-text">{{ timeAgo }}</span>
        </div>

        <!-- Event date display -->
        <Flex y-center class="event-header__date-display">
          <TimestampDate size="xs" :date="event.date" class="event-header__date-time" format="dddd, MMMM D, YYYY [at] HH:mm" />
          <!-- Duration display -->
          <div v-if="event.duration_minutes" class="event-header__duration">
            for {{ formatDurationFromMinutes(event.duration_minutes) }}
          </div>
        </Flex>
      </div>
    </Flex>

    <!-- Event meta information -->
    <Flex gap="m" x-between expand>
      <Flex gap="m" wrap class="event-header__badges-section">
        <Badge v-if="event.location" variant="neutral" size="l">
          <Icon name="ph:map-pin-fill" />
          {{ event.location }}
        </Badge>

        <Tooltip v-if="event.note" placement="bottom">
          <template #tooltip>
            <div class="event-header__tooltip-content">
              {{ event.note }}
            </div>
          </template>
          <Badge variant="neutral" size="l" class="event-header__note-badge">
            <Icon name="ph:note" />
            Note
          </Badge>
        </Tooltip>

        <template v-if="!isOngoing">
          <Badge
            :variant="isOngoing ? 'success' : isUpcoming ? 'accent' : 'neutral'"
            size="l"
          >
            <Icon :name="isUpcoming ? 'ph:calendar-plus' : 'ph:calendar-x'" />
            {{ isUpcoming ? 'Upcoming' : 'Past Event' }}
          </Badge>
        </template>
      </Flex>

      <!-- External Link -->
      <NuxtLink
        v-if="event.link"
        :to="event.link"
        target="_blank"
        rel="noopener noreferrer"
      >
        <Button variant="accent" size="s">
          <template #start>
            <Icon name="ph:link" />
          </template>
          Open Link
        </Button>
      </NuxtLink>
    </Flex>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/breakpoints.scss' as *;

.event-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-l);

  &--ongoing {
    background: linear-gradient(135deg, var(--color-accent-muted), transparent);
  }

  &__title-row {
    align-items: flex-start;

    @media (max-width: $breakpoint-sm) {
      align-items: center;
      flex-direction: column-reverse !important;
      gap: var(--space-m);
    }
  }

  &__title-section {
    flex: 1;
  }

  &__title {
    font-size: var(--font-size-xxxl);
    font-weight: 700;
    margin: 0;
    line-height: 1.2;

    @media (max-width: $breakpoint-sm) {
      font-size: var(--font-size-xxl);
    }

    @media (max-width: $breakpoint-xs) {
      font-size: var(--font-size-xl);
    }
  }

  &__description {
    font-size: var(--font-size-l);
    color: var(--color-text-light);
    margin: var(--space-s) 0 0 0;
    line-height: 1.5;

    @media (max-width: $breakpoint-sm) {
      font-size: var(--font-size-m);
    }
  }

  &__timing-section {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-s);
    min-width: fit-content;

    @media (max-width: $breakpoint-sm) {
      align-items: flex-start;
      width: 100%;
    }
  }

  &__date-display {
    text-align: right;
    gap: 0.5rem !important;

    @media (max-width: $breakpoint-sm) {
      text-align: left;
    }
  }

  &__date-time {
    font-size: var(--font-size-m);
    font-weight: 600;
    color: var(--color-text);
  }

  &__duration {
    font-size: var(--font-size-xs);
    font-weight: 500;

    @media (max-width: $breakpoint-sm) {
      font-size: var(--font-size-s);
    }
  }

  &__time-ago-compact {
    .event-header__time-ago-text {
      font-size: var(--font-size-xxl);
      font-weight: 600;
    }
  }

  &__badges-section {
    align-items: center;
  }

  &__note-badge {
    cursor: help;
    transition: all 0.2s ease;
  }

  &__tooltip-content {
    max-width: 250px;
    font-size: var(--font-size-s);
    line-height: 1.4;
  }
}
</style>
