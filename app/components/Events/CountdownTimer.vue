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

const remainingSeconds = computed(() => {
  if (!props.countdown)
    return null

  return props.countdown.days * 24 * 60 * 60
    + props.countdown.hours * 60 * 60
    + props.countdown.minutes * 60
    + props.countdown.seconds
})

const isCountdownComplete = computed(() => (remainingSeconds.value ?? 1) <= 0)
const shouldShowNow = computed(() => props.isOngoing || isCountdownComplete.value)

// Calculate total remaining time as percentage for border animation (reversed)
const timeProgressPercentage = computed(() => {
  if (remainingSeconds.value === null)
    return 100

  const totalSeconds = Math.max(remainingSeconds.value, 0)
  // Assume max deadline is 30 days for visual purposes
  const maxSeconds = 30 * 24 * 60 * 60
  // Reverse the percentage so it fills up as time decreases
  return Math.max(0, Math.min(100, 100 - (totalSeconds / maxSeconds) * 100))
})
</script>

<template>
  <!-- Loading state with skeletons -->
  <Flex v-if="!countdown" expand class="countdown-timer countdown-timer--loading">
    <Flex gap="s" class="countdown-timer__grid" expand>
      <Flex column y-center x-center class="countdown-timer__item" expand>
        <div class="countdown-timer__number-wrapper">
          <Skeleton height="4.9rem" width="5rem" />
        </div>
      </Flex>
      <Flex column y-center x-center class="countdown-timer__item" expand>
        <div class="countdown-timer__number-wrapper">
          <Skeleton height="4.9rem" width="5rem" />
        </div>
      </Flex>
      <Flex column y-center x-center class="countdown-timer__item" expand>
        <div class="countdown-timer__number-wrapper">
          <Skeleton height="4.9rem" width="5rem" />
        </div>
      </Flex>
      <Flex column y-center x-center class="countdown-timer__item" expand>
        <div class="countdown-timer__number-wrapper">
          <Skeleton height="4.9rem" width="5rem" />
        </div>
      </Flex>
    </Flex>
  </Flex>  <!-- Actual countdown when data is available -->
  <Flex
    v-else
    expand
    class="countdown-timer"
    :class="{ 'countdown-timer--ongoing': shouldShowNow }"
    :style="{ '--time-progress': `${timeProgressPercentage}%` }"
  >
    <!-- Border animation - only show when imminent -->
    <div v-if="isImminent" class="countdown-timer__border" />

    <!-- Show "NOW" when event is ongoing or countdown finishes -->
    <Flex v-if="shouldShowNow" y-center x-center class="countdown-timer__now" expand>
      <span class="countdown-timer__now-text">NOW</span>
    </Flex>

    <!-- Regular countdown grid -->
    <Flex v-else gap="s" class="countdown-timer__grid" expand>
      <Flex column y-center x-center class="countdown-timer__item" data-unit="days" expand>
        <div class="countdown-timer__number-wrapper">
          <span :key="countdown.days" class="countdown-timer__number">{{ countdown.days.toString().padStart(2, '0') }}</span>
        </div>
        <span class="countdown-timer__label">days</span>
      </Flex>
      <Flex column y-center x-center class="countdown-timer__item" data-unit="hours" expand>
        <div class="countdown-timer__number-wrapper">
          <span :key="countdown.hours" class="countdown-timer__number">{{ countdown.hours.toString().padStart(2, '0') }}</span>
        </div>
        <span class="countdown-timer__label">hours</span>
      </Flex>
      <Flex column y-center x-center class="countdown-timer__item" data-unit="minutes" expand>
        <div class="countdown-timer__number-wrapper">
          <span :key="countdown.minutes" class="countdown-timer__number">{{ countdown.minutes.toString().padStart(2, '0') }}</span>
        </div>
        <span class="countdown-timer__label">minutes</span>
      </Flex>
      <Flex column y-center x-center class="countdown-timer__item" data-unit="seconds" expand>
        <div class="countdown-timer__number-wrapper">
          <span :key="countdown.seconds" class="countdown-timer__number">{{ countdown.seconds.toString().padStart(2, '0') }}</span>
        </div>
        <span class="countdown-timer__label">seconds</span>
      </Flex>
    </Flex>
  </Flex>
</template>

<style lang="scss" scoped>
@use '@/assets/breakpoints.scss' as *;

.countdown-timer {
  position: relative;
  padding: 1px;
  min-height: 76px;
  background: linear-gradient(135deg, var(--color-bg-subtle), var(--color-bg));
  border-radius: var(--border-radius-m);
  overflow: hidden;

  @media (max-width: $breakpoint-xs) {
    padding: 1px;
  }

  &__border {
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

  &--ongoing {
    background: linear-gradient(135deg, var(--color-accent-muted), var(--color-bg));
  }

  &--loading {
    .countdown-timer__item:hover {
      transform: none;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
  }

  &__now {
    min-width: 356px;
    min-height: 76px;

    @media (max-width: $breakpoint-s) {
      min-width: auto;
    }
  }

  &__now-text {
    width: 156px;
    text-align: center;
    font-size: 3rem;
    line-height: 5.5rem;
    font-weight: var(--font-weight-black);
    color: var(--color-accent);
    text-transform: uppercase;
    letter-spacing: 0.2em;
    text-shadow: 0 0 20px var(--color-accent);

    @media (max-width: $breakpoint-s) {
      font-size: 2rem;
    }

    @media (max-width: $breakpoint-xs) {
      font-size: var(--font-size-xl);
    }
  }

  &__item {
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
      transform: translateY(-2px) scale(0.9);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    }

    @media (max-width: $breakpoint-s) {
      min-width: auto;
    }

    @media (max-width: $breakpoint-xs) {
      padding: 6px;
    }
  }

  &__number-wrapper {
    position: relative;
    text-align: center;
  }

  &__number {
    font-size: var(--font-size-xxl);
    font-weight: 800;
    color: var(--color-accent);
    margin-bottom: var(--space-s);
    line-height: 1;
    display: inline-block;
    transition: all 0.3s ease;
    animation: whiteFlash 0.6s ease-out;
  }

  &__label {
    font-size: var(--font-size-xxs);
    color: var(--color-text-lightest) !important;
    text-transform: uppercase;
    letter-spacing: 0.5px;

    @media (max-width: $breakpoint-s) {
      font-size: 10px;
    }

    @media (max-width: $breakpoint-xs) {
      font-size: 9px;
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
</style>
