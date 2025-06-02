<script setup lang="ts">
import { Flex, Skeleton } from '@dolanske/vui'
import { computed } from 'vue'

interface Props {
  countdown?: {
    days: number
    hours: number
    minutes: number
    seconds: number
  } | null
  isOngoing?: boolean
}

const props = defineProps<Props>()

// Check if countdown is imminent (less than 24 hours)
const isImminent = computed(() => {
  if (!props.countdown)
    return false
  return props.countdown.days === 0 && props.countdown.hours < 24
})

// Calculate total remaining time as percentage for border animation (reversed)
const timeProgressPercentage = computed(() => {
  if (!props.countdown)
    return 100

  const totalSeconds = props.countdown.days * 24 * 60 * 60
    + props.countdown.hours * 60 * 60
    + props.countdown.minutes * 60
    + props.countdown.seconds

  // Assume max deadline is 30 days for visual purposes
  const maxSeconds = 30 * 24 * 60 * 60
  // Reverse the percentage so it fills up as time decreases
  return Math.max(0, Math.min(100, 100 - (totalSeconds / maxSeconds) * 100))
})
</script>

<template>
  <!-- Loading state with skeletons -->
  <Flex v-if="!countdown" expand class="countdown countdown-loading">
    <Flex gap="s" class="countdown-grid" expand>
      <Flex column y-center x-center class="countdown-item" expand>
        <div class="countdown-number-wrapper">
          <Skeleton height="3rem" width="3.5rem" />
        </div>
      </Flex>
      <Flex column y-center x-center class="countdown-item" expand>
        <div class="countdown-number-wrapper">
          <Skeleton height="3rem" width="3.5rem" />
        </div>
      </Flex>
      <Flex column y-center x-center class="countdown-item" expand>
        <div class="countdown-number-wrapper">
          <Skeleton height="3rem" width="3.5rem" />
        </div>
      </Flex>
      <Flex column y-center x-center class="countdown-item" expand>
        <div class="countdown-number-wrapper">
          <Skeleton height="3rem" width="3.5rem" />
        </div>
      </Flex>
    </Flex>
  </Flex>  <!-- Actual countdown when data is available -->
  <Flex v-else expand class="countdown" :class="{ 'countdown-ongoing': isOngoing }" :style="{ '--time-progress': `${timeProgressPercentage}%` }">
    <!-- Border animation - only show when imminent -->
    <div v-if="isImminent" class="countdown-border" />

    <!-- Show "NOW" when event is ongoing -->
    <Flex v-if="isOngoing" y-center x-center class="countdown-now" expand>
      <span class="now-text">NOW</span>
    </Flex>

    <!-- Regular countdown grid -->
    <Flex v-else gap="s" class="countdown-grid" expand>
      <Flex column y-center x-center class="countdown-item" data-unit="days" expand>
        <div class="countdown-number-wrapper">
          <span :key="countdown.days" class="countdown-number">{{ countdown.days.toString().padStart(2, '0') }}</span>
        </div>
        <span class="countdown-label">days</span>
      </Flex>
      <Flex column y-center x-center class="countdown-item" data-unit="hours" expand>
        <div class="countdown-number-wrapper">
          <span :key="countdown.hours" class="countdown-number">{{ countdown.hours.toString().padStart(2, '0') }}</span>
        </div>
        <span class="countdown-label">hours</span>
      </Flex>
      <Flex column y-center x-center class="countdown-item" data-unit="minutes" expand>
        <div class="countdown-number-wrapper">
          <span :key="countdown.minutes" class="countdown-number">{{ countdown.minutes.toString().padStart(2, '0') }}</span>
        </div>
        <span class="countdown-label">minutes</span>
      </Flex>
      <Flex column y-center x-center class="countdown-item" data-unit="seconds" expand>
        <div class="countdown-number-wrapper">
          <span :key="countdown.seconds" class="countdown-number">{{ countdown.seconds.toString().padStart(2, '0') }}</span>
        </div>
        <span class="countdown-label">seconds</span>
      </Flex>
    </Flex>
  </Flex>
</template>

<style lang="scss" scoped>
@use '@/assets/breakpoints.scss' as *;

.countdown {
  position: relative;
  padding: var(--space-s);
  background: linear-gradient(135deg, var(--color-bg-subtle), var(--color-bg));
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);
  overflow: hidden;

  .countdown-border {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border: 1px solid var(--color-accent);
    border-radius: var(--border-radius-m);
    clip-path: polygon(0 0, var(--time-progress) 0, var(--time-progress) 100%, 0 100%);
    transition: clip-path 1s ease;
    z-index: 1;
    pointer-events: none;
  }

  &.countdown-ongoing {
    background: linear-gradient(135deg, var(--color-accent-muted), var(--color-bg));
  }

  .countdown-now {
    min-width: 356px;

    .now-text {
      width: 156px;
      text-align: center;
      font-size: 3rem;
      line-height: 5.5rem;
      font-weight: 900;
      color: var(--color-accent);
      text-transform: uppercase;
      letter-spacing: 0.2em;
      text-shadow: 0 0 20px var(--color-accent);
    }

    @media (max-width: $breakpoint-sm) {
      min-width: auto;
    }
  }

  .countdown-item {
    gap: 0 !important;
    position: relative;
    padding: var(--space-s);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-s);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    min-width: 80px;

    &:hover {
      transform: translateY(-2px) scale(1.05);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    }

    .countdown-number-wrapper {
      position: relative;
      text-align: center;
    }

    .countdown-number {
      font-size: var(--font-size-xl);
      font-weight: 800;
      color: var(--color-accent);
      line-height: 1;
      display: inline-block;
      transition: all 0.3s ease;
      animation: whiteFlash 0.6s ease-out;
    }

    .countdown-label {
      font-size: var(--font-size-xxs);
      color: var(--color-text-lightest) !important;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
  }

  &.countdown-loading {
    .countdown-item:hover {
      transform: none;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
  }
}

@keyframes whiteFlash {
  0% {
    color: var(--color-accent);
    transform: scale(1.1);
  }
  50% {
    color: var(--color-text-white);
  }
  100% {
    transform: scale(1);
  }
}

@media (max-width: $breakpoint-sm) {
  .countdown {
    .countdown-item {
      min-width: auto;
      padding: var(--space-xs);

      .countdown-number {
        font-size: var(--font-size-l);
      }

      .countdown-label {
        font-size: 10px;
      }
    }

    .countdown-now {
      .now-text {
        font-size: 2rem;
      }
    }
  }
}

@media (max-width: $breakpoint-xs) {
  .countdown {
    .countdown-item {
      padding: 6px;

      .countdown-number {
        font-size: var(--font-size-m);
      }

      .countdown-label {
        font-size: 9px;
      }
    }

    .countdown-now {
      .now-text {
        font-size: 1.5rem;
      }
    }
  }
}
</style>
