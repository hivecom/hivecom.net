<script setup lang="ts">
import { Badge } from '@dolanske/vui'

// Copied over from
// https://github.com/dolanske/vui/blob/main/src/components/Badge/Badge.vue
// because there doesn't seem to be any type helper which extracts
// props from imported components. Any solution I find just throws errors

interface Props {
  variant?: 'neutral' | 'danger' | 'warning' | 'success' | 'info' | 'accent'
  outline?: boolean
  filled?: boolean
}

const props = defineProps<Props>()
</script>

<template>
  <Badge v-bind="props">
    <slot />
  </Badge>
</template>

<style scoped>
.vui-badge {
  padding-inline: 6px;
  min-width: 27.2px;
  justify-content: center;
}
</style>
