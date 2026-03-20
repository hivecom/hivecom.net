<script setup lang="ts">
const props = withDefaults(defineProps<{
  /** Number of rays for layer A */
  raysA?: number
  /** Number of rays for layer B (defaults to raysA + 1) */
  raysB?: number
  /** Size of the rays element in px */
  size?: number
  /** Peak opacity of each ray (0-1) */
  intensity?: number
  /** Ray color as r,g,b string e.g. "255, 215, 0" */
  color?: string
  /** Spin duration for layer A in seconds */
  spinDuration?: number
  /** Scale/shimmer pulse duration in seconds */
  pulseDuration?: number
}>(), {
  raysA: 5,
  raysB: -1,
  size: 140,
  intensity: 0.16,
  color: '255, 215, 0',
  spinDuration: 30,
  pulseDuration: 6,
})

function buildRaysGradient(rayCount: number, color: string, peak: number) {
  const segmentDeg = 360 / rayCount
  const shoulderOffset = segmentDeg * 0.2
  const peakOffset = segmentDeg * 0.47
  const shoulder = peak * 0.3
  const stops: string[] = []

  for (let i = 0; i < rayCount; i++) {
    const base = i * segmentDeg
    stops.push(`transparent ${base}deg`)
    stops.push(`rgba(${color}, ${shoulder}) ${base + shoulderOffset}deg`)
    stops.push(`rgba(${color}, ${peak}) ${base + peakOffset}deg`)
    stops.push(`rgba(${color}, ${shoulder}) ${base + segmentDeg - shoulderOffset}deg`)
    stops.push(`transparent ${base + segmentDeg}deg`)
  }

  return `conic-gradient(from 0deg at 50% 50%, ${stops.join(', ')})`
}

const rayCountB = computed(() => props.raysB >= 0 ? props.raysB : props.raysA + 1)

const raysGradientA = computed(() => buildRaysGradient(props.raysA, props.color, props.intensity))
const raysGradientB = computed(() => buildRaysGradient(rayCountB.value, props.color, props.intensity))

const glowGradient = computed(() =>
  `radial-gradient(circle at 50% 50%, rgba(${props.color}, ${props.intensity * 0.75}) 0%, transparent 45%)`,
)

const layerBackgroundA = computed(() => `${glowGradient.value}, ${raysGradientA.value}`)
const layerBackgroundB = computed(() => `${glowGradient.value}, ${raysGradientB.value}`)

// Layer B offset by half a segment so beams interleave
const offsetDeg = computed(() => 360 / props.raysA / 2)
const spinDurationB = computed(() => props.spinDuration * 1.2)

const half = computed(() => props.size / 2)
</script>

<template>
  <div
    class="light-rays"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
    }"
    aria-hidden="true"
  >
    <!-- Each layer: a zero-size pivot at center that rotates, with the
         sized gradient div offset by -50%/-50% so it stays centered -->
    <div
      class="light-rays__pivot"
      :style="{
        '--spin-duration': `${spinDuration}s`,
        '--start-deg': '0deg',
        '--end-deg': '360deg',
        'top': `${half}px`,
        'left': `${half}px`,
      } as Record<string, string>"
    >
      <div
        class="light-rays__layer light-rays__layer--a"
        :style="{
          'width': `${size}px`,
          'height': `${size}px`,
          'margin-left': `-${half}px`,
          'margin-top': `-${half}px`,
          'background': layerBackgroundA,
          '--pulse-duration': `${pulseDuration}s`,
        } as Record<string, string>"
      />
    </div>

    <div
      class="light-rays__pivot"
      :style="{
        '--spin-duration': `${spinDurationB}s`,
        '--start-deg': `${offsetDeg}deg`,
        '--end-deg': `${offsetDeg - 360}deg`,
        'top': `${half}px`,
        'left': `${half}px`,
      } as Record<string, string>"
    >
      <div
        class="light-rays__layer light-rays__layer--b"
        :style="{
          'width': `${size}px`,
          'height': `${size}px`,
          'margin-left': `-${half}px`,
          'margin-top': `-${half}px`,
          'background': layerBackgroundB,
          '--pulse-duration': `${pulseDuration}s`,
        } as Record<string, string>"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.light-rays {
  position: absolute;
  pointer-events: none;
  // Caller is responsible for top/left positioning
  transform: translate(-50%, -50%);

  &__pivot {
    position: absolute;
    width: 0;
    height: 0;
    animation: light-rays-spin var(--spin-duration) linear infinite;
  }

  &__layer {
    position: absolute;
    mix-blend-mode: screen;
    mask-image: radial-gradient(circle at 50% 50%, black 0%, black 35%, transparent 70%);

    &--a {
      animation:
        light-rays-pulse var(--pulse-duration) linear infinite alternate,
        light-rays-shimmer calc(var(--pulse-duration) * 1.3) linear infinite alternate;
    }

    &--b {
      opacity: 0.5;
      animation:
        light-rays-pulse var(--pulse-duration) linear infinite alternate-reverse,
        light-rays-shimmer calc(var(--pulse-duration) * 1.1) linear infinite alternate-reverse;
      animation-delay: calc(var(--pulse-duration) * -0.5), calc(var(--pulse-duration) * -0.65);
    }
  }
}

@keyframes light-rays-spin {
  from {
    transform: rotate(var(--start-deg));
  }
  to {
    transform: rotate(var(--end-deg));
  }
}

@keyframes light-rays-pulse {
  from {
    scale: 0.92;
  }
  to {
    scale: 1.08;
  }
}

@keyframes light-rays-shimmer {
  0% {
    opacity: 0.45;
    filter: hue-rotate(-6deg);
  }
  100% {
    opacity: 1;
    filter: hue-rotate(10deg);
  }
}
</style>
