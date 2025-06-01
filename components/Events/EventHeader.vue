<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Badge, Button, Flex, Tooltip } from '@dolanske/vui'
import TimestampDate from '~/components/Shared/TimestampDate.vue'
import CountdownTimer from './CountdownTimer.vue'

interface Props {
  event: Tables<'events'>
  isUpcoming: boolean
  countdown?: {
    days: number
    hours: number
    minutes: number
    seconds: number
  }
  timeAgo?: string
}

defineProps<Props>()
</script>

<template>
  <div class="event-header-section">
    <!-- Title and actions row -->
    <Flex x-between align="start" gap="l" class="title-row">
      <div class="title-section">
        <h1 class="event-title">
          {{ event.title }}
        </h1>
        <p v-if="event.description" class="event-description">
          {{ event.description }}
        </p>
      </div>

      <!-- Timing/Countdown Section -->
      <div class="timing-section">
        <!-- Enhanced Countdown for upcoming events -->
        <CountdownTimer
          v-if="isUpcoming && countdown"
          :countdown="countdown"
        />

        <!-- Time ago for past events -->
        <div v-else-if="!isUpcoming && timeAgo" class="time-ago-compact">
          <span class="time-ago-text">{{ timeAgo }}</span>
        </div>

        <!-- Event date display -->
        <div class="event-date-display">
          <TimestampDate small :date="event.date" class="event-date-time" format="dddd, MMMM D, YYYY [at] HH:mm" />
        </div>
      </div>
    </Flex>

    <!-- Event meta information -->
    <div class="info-section">
      <Flex gap="m" wrap class="badges-section">
        <Badge v-if="event.location" variant="accent" size="l">
          <Icon name="ph:map-pin-fill" />
          {{ event.location }}
        </Badge>

        <Tooltip v-if="event.note" placement="bottom">
          <template #tooltip>
            <div class="tooltip-content">
              {{ event.note }}
            </div>
          </template>
          <Badge variant="neutral" size="l" class="note-badge">
            <Icon name="ph:note" />
            Note
          </Badge>
        </Tooltip>

        <Badge
          :variant="isUpcoming ? 'success' : 'neutral'"
          size="l"
        >
          <Icon :name="isUpcoming ? 'ph:calendar-plus' : 'ph:calendar-x'" />
          {{ isUpcoming ? 'Upcoming' : 'Past Event' }}
        </Badge>

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
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/breakpoints.scss' as *;

.event-header-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-l);
}

.title-row {
  align-items: flex-start;
  @media screen and (max-width: $breakpoint-sm) {
    align-items: center;
    flex-direction: column-reverse !important;
  }
}

.title-section {
  flex: 1;
}

.event-title {
  font-size: var(--font-size-xxxl);
  font-weight: 700;
  margin: 0;
  line-height: 1.2;
}

.event-description {
  font-size: var(--font-size-l);
  color: var(--color-text-muted);
  margin: var(--space-s) 0 0 0;
  line-height: 1.5;
}

.timing-section {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-s);
  min-width: fit-content;
}

.event-date-display {
  text-align: right;

  .event-date-time {
    font-size: var(--font-size-m);
    font-weight: 600;
    color: var(--color-text);
  }
}

.time-ago-compact {
  .time-ago-text {
    font-size: var(--font-size-xxl);
    font-weight: 600;
    color: var(--color-text-muted);
  }
}

.info-section {
  .badges-section {
    align-items: center;
  }
}

.note-badge {
  cursor: help;
  transition: all 0.2s ease;
}

.tooltip-content {
  max-width: 250px;
  font-size: var(--font-size-s);
  line-height: 1.4;
}

@media (max-width: $breakpoint-sm) {
  .title-row {
    flex-direction: column;
    gap: var(--space-m);
  }

  .timing-section {
    align-items: flex-start;
    width: 100%;
  }

  .event-date-display {
    text-align: left;
  }

  .event-title {
    font-size: var(--font-size-xxl);
  }

  .event-description {
    font-size: var(--font-size-m);
  }
}

@media (max-width: $breakpoint-xs) {
  .event-title {
    font-size: var(--font-size-xl);
  }
}
</style>
