<script setup lang="ts">
import type { VUI_COLOR_KEYS } from '@/lib/theme'
import type { Tables } from '@/types/database.overrides'
import { Flex, Grid } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'
import { COLOR_GROUPS } from '@/lib/theme'

const props = defineProps<{
  data: Tables<'themes'>
}>()

const COLOR_VARIANTS = ['light', 'dark'] as const

function extractColor(prefix: typeof COLOR_VARIANTS[number], colorKey: typeof VUI_COLOR_KEYS[number]): string {
  const key = `${prefix}_${colorKey.replace(/-/g, '_')}` as keyof Tables<'themes'>
  return props.data[key] as string
}

const isMobile = useBreakpoint('<s')
</script>

<template>
  <Grid :columns="isMobile ? 1 : 2" gap="xxl">
    <Flex v-for="prefix in COLOR_VARIANTS" :key="prefix" column gap="xl">
      <Icon :size="28" :name="prefix === 'light' ? 'ph:sun' : 'ph:moon'" class="text-color-accent" />
      <Flex
        v-for="(colors, groupName) in COLOR_GROUPS"
        :key="groupName"
        column
        gap="s"
      >
        <span>{{ groupName }}</span>
        <Flex v-for="colorKey in colors" :key="colorKey" y-center gap="l" x-start>
          <div
            class="color-cube"
            :style="{ backgroundColor: extractColor(prefix, colorKey) }"
          />
          <span class="color-label">
            {{ extractColor(prefix, colorKey) }}
          </span>
        </Flex>
      </Flex>
    </Flex>
  </Grid>
</template>

<style lang="scss" scoped>
.color-cube {
  display: block;
  width: 28px;
  height: 28px;
  border-radius: var(--border-radius-s);
}

.color-label {
  font-size: var(--font-size-m);
  color: var(--color-text-lighter);
}
</style>
