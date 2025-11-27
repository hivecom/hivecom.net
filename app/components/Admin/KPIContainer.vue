<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import { useAttrs } from 'vue'

const props = withDefaults(defineProps<{
  gap?: number
  expand?: boolean
}>(), {
  gap: 8,
  expand: true,
})

const attrs = useAttrs()
</script>

<template>
  <Flex
    class="kpi-container"
    :gap="props.gap"
    :expand="props.expand"
    v-bind="attrs"
  >
    <slot />
  </Flex>
</template>

<style scoped lang="scss">
@use '@/assets/breakpoints.scss' as *;

.kpi-container {
  width: 100%;
  flex-wrap: nowrap !important;

  @media (max-width: $breakpoint-m) {
    flex-wrap: wrap !important;
  }
}
</style>
