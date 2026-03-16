<script setup lang="ts">
import { Flex, Skeleton } from '@dolanske/vui'

interface Props {
  loadingCount?: number
}

const {
  loadingCount = 4,
} = defineProps<Props>()
</script>

<template>
  <Flex v-for="key in loadingCount" :key class="notification-skeleton" expand y-center>
    <Skeleton :height="28" :width="28" :radius="99" />
    <Skeleton :height="20" :radius="99" :width="126" />
  </Flex>
</template>

<style scoped lang="scss">
.notification-skeleton {
  padding: var(--space-s);
  width: 100px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);
}
</style>
