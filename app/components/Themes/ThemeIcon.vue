<script setup lang="ts">
import type { Sizes } from '@dolanske/vui'
import type { ThemeVariant } from '@/composables/useUserTheme'
import type { Theme } from '@/types/theme'
import { theme } from '@dolanske/vui'
import { hashSeed } from '@/lib/utils/random'

interface Props {
  theme: Theme
  size?: Sizes | 'xl'
}

const props = withDefaults(defineProps<Props>(), {
  size: 'm',
})

const SIZE_PX: Record<string, number> = {
  s: 24,
  m: 32,
  l: 40,
  xl: 72,
}

function seededRng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xFFFFFFFF
  }
}

const meshStyle = computed(() => {
  // const { theme } = props
  const colors = [
    props.theme[`${theme.value as ThemeVariant}_accent`],
    props.theme[`${theme.value as ThemeVariant}_text_yellow`],
    props.theme[`${theme.value as ThemeVariant}_text_red`],
    props.theme[`${theme.value as ThemeVariant}_text_blue`],
  ]

  const rng = seededRng(hashSeed(props.theme.id))

  const gradients = colors.map(color =>
    `radial-gradient(circle at ${Math.round(rng() * 100)}% ${Math.round(rng() * 100)}%, ${color} 0%, transparent 65%)`,
  )

  const px = SIZE_PX[props.size] ?? 40

  return {
    background: [...gradients, props.theme[`${theme.value as ThemeVariant}_bg_lowered`]].join(', '),
    width: `${px}px`,
    height: `${px}px`,
    borderRadius: `var(--border-radius-${props.size})`,
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
