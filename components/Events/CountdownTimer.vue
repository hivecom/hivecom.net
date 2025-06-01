<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import { computed } from 'vue'

interface Props {
  countdown: {
    days: number
    hours: number
    minutes: number
    seconds: number
  }
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
  <Flex expand class="countdown" :class="{ imminent: isImminent }" :style="{ '--time-progress': `${timeProgressPercentage}%` }">
    <div class="countdown-border" />
    <div class="countdown-glow" />
    <Flex gap="m" class="countdown-grid" expand>
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
        <span class="countdown-label">mins</span>
      </Flex>
      <Flex column y-center x-center class="countdown-item" data-unit="seconds" expand>
        <div class="countdown-number-wrapper">
          <span :key="countdown.seconds" class="countdown-number">{{ countdown.seconds.toString().padStart(2, '0') }}</span>
        </div>
        <span class="countdown-label">secs</span>
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
  border: 2px solid var(--color-border);
  border-radius: var(--border-radius-m);
  overflow: hidden;

  .countdown-border {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border: 3px solid var(--color-accent);
    border-radius: var(--border-radius-m);
    clip-path: polygon(0 0, var(--time-progress) 0, var(--time-progress) 100%, 0 100%);
    transition: clip-path 1s ease;
    z-index: 1;
    pointer-events: none;
  }

  &.imminent {
    border-color: var(--color-accent);
    background: linear-gradient(135deg, rgba(var(--color-accent-rgb), 0.1), var(--color-bg));
    box-shadow: 0 0 20px rgba(var(--color-accent-rgb), 0.3);
    animation: imminentGlow 2s ease-in-out infinite alternate;

    .countdown-number {
      color: var(--color-accent) !important;
      text-shadow: 0 0 10px rgba(var(--color-accent-rgb), 0.5);
    }

    .countdown-border {
      border-color: var(--color-accent);
      box-shadow: 0 0 15px rgba(var(--color-accent-rgb), 0.4);
    }

    .countdown-item {
      box-shadow:
        0 2px 8px rgba(0, 0, 0, 0.1),
        0 0 10px rgba(var(--color-accent-rgb), 0.2);
    }
  }

  .countdown-glow {
    position: absolute;
    top: -2px;
    left: -2px;
    right: -2px;
    bottom: -2px;
    background: linear-gradient(45deg, var(--color-accent), var(--color-primary));
    border-radius: var(--border-radius-m);
    opacity: 0;
    z-index: -1;
    transition: opacity 0.3s ease;
  }

  &:hover .countdown-glow {
    opacity: 0.3;
    animation: rotate 3s linear infinite;
  }

  .countdown-item {
    position: relative;
    padding: var(--space-s);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-s);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

    &:hover {
      transform: translateY(-2px) scale(1.05);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    }

    .countdown-number-wrapper {
      position: relative;
      width: 100%;
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
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
      font-weight: 600;
      margin-top: var(--space-xs);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
  }
}

@keyframes imminentGlow {
  0% {
    box-shadow: 0 0 20px rgba(var(--color-accent-rgb), 0.3);
  }
  100% {
    box-shadow:
      0 0 30px rgba(var(--color-accent-rgb), 0.6),
      0 0 40px rgba(var(--color-accent-rgb), 0.3);
  }
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
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
      padding: var(--space-xs);

      .countdown-number {
        font-size: var(--font-size-l);
      }

      .countdown-label {
        font-size: 10px;
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
  }
}
</style>
