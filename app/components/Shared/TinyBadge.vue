<script setup lang="ts">
import { Badge } from '@dolanske/vui'

type TinyBadgeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent'

interface Props {
  variant?: TinyBadgeVariant
}

withDefaults(defineProps<Props>(), {
  variant: 'neutral',
})
</script>

<template>
  <Badge class="tiny-badge" size="xs" :variant="variant">
    <slot />
  </Badge>
</template>

<style lang="scss">
.tiny-badge {
  font-size: calc(var(--font-size-xxs) * 0.8);
  padding: 0 6px;
  line-height: 0;

  span,
  .iconify {
    font-size: calc(var(--font-size-xxs) * 1) !important;
  }
}
</style>
