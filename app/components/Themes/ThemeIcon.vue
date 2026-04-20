<script setup lang="ts">
import type { Sizes } from '@dolanske/vui'
import type { ThemeVariant } from '@/composables/useUserTheme'
import type { Theme } from '@/types/theme'
import { theme } from '@dolanske/vui'
import { hashSeed } from '@/lib/utils/random'

interface Props {
  theme: Theme
  size?: Sizes | 'xl'
  animated?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 'm',
  animated: false,
})

const SIZE_PX: Record<string, number> = {
  s: 24,
  m: 32,
  l: 40,
  xl: 72,
}

// Animated positions - four gradient blobs each with their own phase offset
const ANIM_TARGETS = [
  { x: 20, y: 30 },
  { x: 75, y: 20 },
  { x: 60, y: 75 },
  { x: 25, y: 70 },
]

const animTime = ref(0)
let rafId: number | null = null

onMounted(() => {
  if (!props.animated)
    return

  let start: number | null = null
  const CYCLE_MS = 6000

  function tick(ts: number) {
    if (start === null)
      start = ts
    animTime.value = ((ts - start) % CYCLE_MS) / CYCLE_MS
    rafId = requestAnimationFrame(tick)
  }

  rafId = requestAnimationFrame(tick)
})

onUnmounted(() => {
  if (rafId !== null)
    cancelAnimationFrame(rafId)
})

function seededRng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xFFFFFFFF
  }
}

// Smooth eased interpolation between two target positions using a sine wave
function animatedPosition(index: number): { x: number, y: number } {
  const t = animTime.value
  // Each blob oscillates independently with a phase offset
  const phase = (index / ANIM_TARGETS.length)
  const tPhased = (t + phase) % 1
  // Use sine to ease back and forth smoothly
  const ease = (Math.sin(tPhased * Math.PI * 2) + 1) / 2
  const target = ANIM_TARGETS[index] ?? ANIM_TARGETS[0]!
  const opposite = ANIM_TARGETS[(index + 2) % ANIM_TARGETS.length] ?? ANIM_TARGETS[0]!
  return {
    x: Math.round(opposite.x + (target.x - opposite.x) * ease),
    y: Math.round(opposite.y + (target.y - opposite.y) * ease),
  }
}

const meshStyle = computed(() => {
  const colors = [
    props.theme[`${theme.value as ThemeVariant}_accent`],
    props.theme[`${theme.value as ThemeVariant}_text_yellow`],
    props.theme[`${theme.value as ThemeVariant}_text_red`],
    props.theme[`${theme.value as ThemeVariant}_text_blue`],
  ]

  let gradients: string[]

  if (props.animated) {
    gradients = colors.map((color, i) => {
      const pos = animatedPosition(i)
      return `radial-gradient(circle at ${pos.x}% ${pos.y}%, ${color} 0%, transparent 65%)`
    })
  }
  else {
    const rng = seededRng(hashSeed(props.theme.id))
    gradients = colors.map(color =>
      `radial-gradient(circle at ${Math.round(rng() * 100)}% ${Math.round(rng() * 100)}%, ${color} 0%, transparent 65%)`,
    )
  }

  const px = SIZE_PX[props.size] ?? 40

  return {
    background: [...gradients, props.theme[`${theme.value as ThemeVariant}_bg_lowered`]].join(', '),
    width: `${px}px`,
    height: `${px}px`,
    borderRadius: `var(--border-radius-${props.size === 'xl' ? 'l' : props.size})`,
  }
})
</script>

<template>
  <div class="theme-logo" :style="meshStyle" />
</template>

<style scoped lang="scss">
.theme-logo {
  flex-shrink: 0;
}
</style>
