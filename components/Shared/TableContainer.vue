<script setup lang="ts">
import { Flex } from '@dolanske/vui'

defineProps<{ class?: string }>()
</script>

<template>
  <Flex :class="`table-overflow ${$props.class}`" expand>
    <slot />
  </Flex>
</template>

<style scoped>
.table-overflow {
  display: flex;
  overflow-x: auto;
  max-width: 94vw;
}
</style>
