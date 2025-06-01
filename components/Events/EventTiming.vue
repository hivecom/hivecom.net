<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Card, Flex, Grid } from '@dolanske/vui'
import TimestampDate from '~/components/Shared/TimestampDate.vue'

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
  <Card class="event-timing">
    <Flex column gap="l">
      <!-- Event Date -->
      <div class="event-date-section">
        <h3 class="section-title">
          <Icon name="ph:calendar" />
          Event Date
        </h3>
        <div class="event-date-display">
          <TimestampDate :date="event.date" class="event-date-time" format="full" />
        </div>
      </div>

      <!-- Countdown for upcoming events -->
      <div v-if="isUpcoming && countdown" class="countdown-section">
        <h4 class="countdown-title">
          Time Remaining
        </h4>
        <Grid :columns="4" gap="m" class="countdown-grid">
          <div class="countdown-item">
            <Card>
              <Flex column x-center gap="xs">
                <span class="countdown-number">{{ countdown.days }}</span>
                <span class="countdown-label">Days</span>
              </Flex>
            </Card>
          </div>
          <div class="countdown-item">
            <Card>
              <Flex column x-center gap="xs">
                <span class="countdown-number">{{ countdown.hours }}</span>
                <span class="countdown-label">Hours</span>
              </Flex>
            </Card>
          </div>
          <div class="countdown-item">
            <Card>
              <Flex column x-center gap="xs">
                <span class="countdown-number">{{ countdown.minutes }}</span>
                <span class="countdown-label">Minutes</span>
              </Flex>
            </Card>
          </div>
          <div class="countdown-item">
            <Card>
              <Flex column x-center gap="xs">
                <span class="countdown-number">{{ countdown.seconds }}</span>
                <span class="countdown-label">Seconds</span>
              </Flex>
            </Card>
          </div>
        </Grid>
      </div>

      <!-- Time ago for past events -->
      <div v-else-if="!isUpcoming && timeAgo" class="time-ago-section">
        <h4 class="time-ago-title">
          Event Completed
        </h4>
        <div class="time-ago-display">
          <span class="time-ago-text">{{ timeAgo }}</span>
        </div>
      </div>
    </Flex>
  </Card>
</template>

<style lang="scss" scoped>
@use '@/assets/breakpoints.scss' as *;

.section-title {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  font-size: var(--font-size-xl);
  font-weight: 600;
  margin: 0;
  color: var(--color-text);

  svg {
    color: var(--color-accent);
  }
}

.countdown-section {
  .countdown-title {
    font-size: var(--font-size-l);
    font-weight: 600;
    margin: 0 0 var(--space-m) 0;
    color: var(--color-text);
  }

  .countdown-grid {
    .countdown-item {
      background: var(--color-bg-subtle);
      border: 1px solid var(--color-border);

      .countdown-number {
        font-size: var(--font-size-xxl);
        font-weight: 700;
        color: var(--color-accent);
        line-height: 1;
      }

      .countdown-label {
        font-size: var(--font-size-s);
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        font-weight: 600;
      }
    }
  }
}

.time-ago-section {
  .time-ago-title {
    font-size: var(--font-size-l);
    font-weight: 600;
    margin: 0 0 var(--space-s) 0;
    color: var(--color-text);
  }

  .time-ago-display {
    .time-ago-text {
      font-size: var(--font-size-xl);
      font-weight: 600;
      color: var(--color-text-muted);
    }
  }
}

@media (max-width: $breakpoint-sm) {
  .countdown-grid {
    grid-template-columns: repeat(2, 1fr) !important;
  }
}

@media (max-width: $breakpoint-xs) {
  .countdown-grid {
    grid-template-columns: 1fr !important;
  }
}
</style>
