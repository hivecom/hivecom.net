<script setup lang="ts">
import { Badge } from '@dolanske/vui'

// No need to define any props or attrs as they will be automatically inherited
</script>

<template>
  <Badge>
    <slot />
  </Badge>
</template>

<style scoped>
.vui-badge {
  padding-inline: 2px;
  min-width: 24px;
  justify-content: center;
}
</style>
