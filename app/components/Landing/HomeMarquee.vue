<script setup lang="ts">
interface Props {
  direction?: 'left' | 'right'
  speed?: number
  stagger?: boolean
}

const {
  /**
   * Arbitrary speed value. Zero equals no movement
   */
  speed = 0,
  /**
   * Direction of the marquee, either left or right
   */
  direction = 'right',
  /**
   * Disables smoothing
   */
  stagger,
} = defineProps<Props>()

// Animation state
const position = ref(0)

const INTERVAL_MS = 100
const step = computed(() => speed * INTERVAL_MS / 1000)

useIntervalFn(() => {
  position.value += step.value
}, INTERVAL_MS, {
  immediate: true,
})
</script>

<template>
  <div class="marquee-wrap">
    <div
      class="marquee-content"
      :class="[`marquee-direction-${direction}`]"
      :style="{
        transform: `translateX(${direction === 'left' ? -position : position}px)`,
        transitionDuration: stagger ? '0s' : `${INTERVAL_MS / 1000}s`,
      }"
    >
      <slot />
    </div>
  </div>
</template>

<style scoped lang="scss">
.marquee-wrap {
  display: block;
  width: 100%;
  position: relative;
  overflow: hidden;

  .marquee-content {
    position: absolute;
    top: 0;
    right: 0;
    will-change: transform;
    transition-timing-function: linear;
    transition-property: transform;

    // No transition, we simply jump
    &.stagger {
      transition: unset;
    }

    &.marquee-direction-left {
      right: unset;
      left: 0;
    }

    * {
      white-space: nowrap;
    }
  }
}
</style>
