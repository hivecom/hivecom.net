<script setup lang="ts">
interface Props {
  direction?: 'left' | 'right'
  // Speed in px/s
  speed?: number
  // Stepped/jerky movement instead of smooth scroll
  stagger?: boolean
}

const {
  speed = 50,
  direction = 'right',
  stagger,
} = defineProps<Props>()

const trackRef = ref<HTMLElement>()
const contentWidth = ref(0)

// On mount, we compute the width of the marquee component and use it to
// properly calculate the width of the content we'll be rendering. For smooth
// infinite-like animation, we duplicate the track, so just grabbing width of
// one of hte copies is enough
useResizeObserver(trackRef, (entries) => {
  const entry = entries[0]
  if (entry) {
    contentWidth.value = (entry.target as HTMLElement).scrollWidth / 2
  }
})

const duration = computed(() => contentWidth.value > 0 ? contentWidth.value / speed : 0)

const timingFunction = computed(() => {
  if (!stagger || contentWidth.value === 0)
    return 'linear'

  // Divide the animation into steps based on content width to create a stagger effect
  const steps = Math.max(1, Math.round(contentWidth.value / 50))
  return `steps(${steps}, end)`
})
</script>

<template>
  <div class="marquee-wrap">
    <div
      ref="trackRef"
      class="marquee-track"
      :style="{
        animationDuration: `${duration}s`,
        animationDirection: direction === 'left' ? 'normal' : 'reverse',
        animationTimingFunction: timingFunction,
      }"
    >
      <div class="marquee-content">
        <slot />
      </div>
      <!-- Duplicate for seamless loop -->
      <div class="marquee-content" aria-hidden="true">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.marquee-wrap {
  display: block;
  width: 100%;
  overflow: hidden;
}

.marquee-track {
  display: flex;
  width: max-content;
  will-change: transform;
  animation: marquee-scroll linear infinite;
}

.marquee-content {
  display: flex;
  flex-shrink: 0;

  * {
    white-space: nowrap;
  }
}

@keyframes marquee-scroll {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-50%);
  }
}
</style>
