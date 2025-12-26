<script setup lang="ts">
import { Divider, Flex, Progress, Skeleton, Tooltip } from '@dolanske/vui'
import dayjs from 'dayjs'
import { computed } from 'vue'

interface Props {
  countdown?: {
    days: number
    hours: number
    minutes: number
    seconds: number
  } | null
  isOngoing?: boolean
  createdAt: string
  simple?: boolean
}

const props = defineProps<Props>()

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

// Calculate percentage of time elapsed between createdAt and endingAt (or derive ending time)
// 0 = createdAt, 100 = endingAt / countdown finished
const timeProgressPercentage = computed(() => {
  if (remainingSeconds.value === null)
    return 0

  const remaining = Math.max(remainingSeconds.value, 0)

  // No endingAt provided: derive total duration as elapsed since creation + remaining
  const elapsed = Math.max(dayjs().diff(dayjs(props.createdAt), 'seconds'), 0)
  const totalDuration = elapsed + remaining

  if (totalDuration === 0)
    return remaining <= 0 ? 100 : 0

  const progress = (elapsed / totalDuration) * 100
  return Math.max(0, Math.min(100, progress))
})
</script>

<template>
  <!-- Loading state with skeletons -->
  <div v-if="!countdown" class="countdown-timer" :class="{ 'countdown-timer--simple': props.simple }">
    <Flex gap="s" y-center>
      <Flex column y-center x-center gap="xxs" class="countdown-timer__item">
        <Skeleton height="30px" width="29px" />
        <Skeleton height="11px" width="27px" />
      </Flex>
      <Divider vertical :size="props.simple ? 40 : 64" />
      <Flex column y-center x-center gap="xxs" class="countdown-timer__item">
        <Skeleton height="30px" width="29px" />
        <Skeleton height="11px" width="27px" />
      </Flex>
      <Divider vertical :size="props.simple ? 40 : 64" />
      <Flex column y-center x-center gap="xxs" class="countdown-timer__item">
        <Skeleton height="30px" width="29px" />
        <Skeleton height="11px" width="27px" />
      </Flex>
      <template v-if="!props.simple">
        <Divider vertical :size="props.simple ? 40 : 64" />
        <Flex column y-center x-center gap="xxs" class="countdown-timer__item">
          <Skeleton height="30px" width="29px" />
          <Skeleton height="11px" width="27px" />
        </Flex>
      </template>
    </Flex>
    <div v-if="!props.simple" class="countdown-timer__progress-wrapper">
      <Skeleton width="100%" height="4px" />
    </div>
  </div>
  <!-- Actual countdown when data is available -->
  <div
    v-else
    class="countdown-timer"
    :class="{
      'countdown-timer--ongoing': shouldShowNow,
      'countdown-timer--simple': props.simple,
    }"

    :style="{ '--time-progress': `${timeProgressPercentage}%` }"
  >
    <!-- Show "NOW" when event is ongoing or countdown finishes -->
    <span v-if="shouldShowNow" class="countdown-timer__now-text">Ongoing</span>

    <!-- Regular countdown grid -->
    <template v-else>
      <Flex gap="s" y-center>
        <Flex column y-center x-center gap="xxs" class="countdown-timer__item" data-unit="days">
          <div class="countdown-timer__number-wrapper">
            <span :key="countdown.days" class="countdown-timer__number">{{ countdown.days.toString().padStart(2, '0') }}</span>
          </div>
          <span class="countdown-timer__label">days</span>
        </Flex>
        <Divider vertical :size="props.simple ? 40 : 64" />
        <Flex column y-center x-center gap="xxs" class="countdown-timer__item" data-unit="hours">
          <div class="countdown-timer__number-wrapper">
            <span :key="countdown.hours" class="countdown-timer__number">{{ countdown.hours.toString().padStart(2, '0') }}</span>
          </div>
          <span class="countdown-timer__label">hours</span>
        </Flex>
        <Divider vertical :size="props.simple ? 40 : 64" />

        <Flex column y-center x-center gap="xxs" class="countdown-timer__item" data-unit="minutes">
          <div class="countdown-timer__number-wrapper">
            <span :key="countdown.minutes" class="countdown-timer__number">{{ countdown.minutes.toString().padStart(2, '0') }}</span>
          </div>
          <span class="countdown-timer__label">minutes</span>
        </Flex>
        <Divider vertical :size="props.simple ? 40 : 64" />

        <Flex column y-center x-center gap="xxs" class="countdown-timer__item" data-unit="seconds">
          <div class="countdown-timer__number-wrapper">
            <span :key="countdown.seconds" class="countdown-timer__number">{{ countdown.seconds.toString().padStart(2, '0') }}</span>
          </div>
          <span class="countdown-timer__label">seconds</span>
        </Flex>
      </Flex>

      <Tooltip v-if="!props.simple">
        <div class="countdown-timer__progress-wrapper">
          <Progress v-model="timeProgressPercentage" />
        </div>
        <template #tooltip>
          <p>We are {{ timeProgressPercentage.toFixed(2) }}% there</p>
        </template>
      </Tooltip>
    </template>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/breakpoints.scss' as *;

.countdown-timer {
  position: relative;
  padding: var(--space-s);
  background-color: var(--color-bg-raised);
  border-radius: var(--border-radius-m);
  overflow: hidden;

  &--simple {
    .countdown-timer {
      &__item {
        padding: var(--space-xs);
      }

      &__number {
        color: var(--color-text-light) !important;
        font-weight: var(--font-weight);
        font-size: var(--font-size-l);
      }
    }
  }

  &--ongoing {
    display: flex;
    align-items: center;
    justify-content: center;
    max-width: 356px;
    width: 100%;
    height: 80px;
  }

  &__now-text {
    font-size: 3rem;
    font-weight: var(--font-weight-black);
    color: var(--color-accent);
    text-transform: uppercase;
    text-shadow: 0 0 20px var(--color-bg-accent-raised);
    margin-bottom: -6px;

    @media (max-width: $breakpoint-s) {
      font-size: 2rem;
    }

    @media (max-width: $breakpoint-xs) {
      font-size: var(--font-size-xl);
    }
  }

  &__item {
    position: relative;
    padding: var(--space-s);
    // border-right: 1px solid var(--color-border-strong);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    min-width: 80px;

    &:hover {
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    }

    &:last-of-type {
      border-right: none;
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
    margin-bottom: var(--space-xxs);
    line-height: 1;
    display: inline-block;
    transition: all 0.3s ease;
    animation: whiteFlash 0.6s ease-out;
  }

  &__label {
    font-size: var(--font-size-xxs);
    color: var(--color-text-light) !important;
    text-transform: capitalize;
    letter-spacing: 0.5px;

    @media (max-width: $breakpoint-s) {
      font-size: 10px;
    }

    @media (max-width: $breakpoint-xs) {
      font-size: 9px;
    }
  }

  &__progress-wrapper {
    height: 8px;
    display: flex;
    align-items: center;
    margin-top: var(--space-xs);

    .vui-progress {
      background-color: var(--color-text-lightest);
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
