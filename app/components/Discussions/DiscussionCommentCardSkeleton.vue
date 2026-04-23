<script setup lang="ts">
import { Flex, Skeleton } from '@dolanske/vui'
</script>

<template>
  <div class="comment-card-skeleton">
    <!-- Header row: avatar + username + timestamp -->
    <Flex y-center gap="s">
      <Skeleton :width="48" :height="32" style="border-radius: var(--border-radius-pill);" />
      <Skeleton :width="90" :height="14" :radius="4" />
      <Skeleton :width="60" :height="12" :radius="4" />
      <Flex expand />
    </Flex>

    <!-- Content lines -->
    <Flex column gap="xs" class="comment-card-skeleton__content">
      <Skeleton class="comment-card-skeleton__line" :height="14" :radius="4" />
    </Flex>
  </div>
</template>

<style lang="scss" scoped>
.comment-card-skeleton {
  &__content {
    padding-left: var(--space-xxl); /* Indent to align with content of actual comment card */
  }
}
</style>
