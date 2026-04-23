<script setup lang="ts">
import { Flex, Skeleton } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'

const isMobile = useBreakpoint('<m')
</script>

<template>
  <div class="reply-card-skeleton">
    <div v-if="!isMobile" class="reply-card-skeleton__sidebar">
      <Flex column y-center x-center gap="s">
        <Skeleton :width="56" :height="56" style="border-radius: var(--border-radius-pill);" />
        <Skeleton :width="90" :height="14" :radius="4" />
        <Skeleton :width="110" :height="12" :radius="4" />
        <Skeleton :width="100" :height="12" :radius="4" />
      </Flex>
    </div>

    <div class="reply-card-skeleton__content">
      <Flex v-if="isMobile" y-center gap="s" class="mb-s">
        <Skeleton :width="28" :height="28" style="border-radius: var(--border-radius-pill);" />
        <Skeleton :width="80" :height="14" :radius="4" />
      </Flex>
      <Skeleton class="reply-card-skeleton__full mb-m" :height="80" :radius="8" />
      <Flex y-center x-between>
        <Flex gap="m" y-center>
          <Skeleton :width="100" :height="12" :radius="4" />
          <Skeleton :width="60" :height="12" :radius="4" />
        </Flex>
        <Flex gap="xs">
          <Skeleton :width="40" :height="28" :radius="8" />
          <Skeleton :width="28" :height="28" :radius="8" />
        </Flex>
      </Flex>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.reply-card-skeleton {
  display: flex;
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);
  overflow: hidden;

  &__full {
    width: 100%;
  }

  &__sidebar {
    width: 200px;
    min-width: 200px;
    padding: var(--space-l) var(--space-m);
    border-right: 1px solid var(--color-border);
  }

  &__content {
    flex: 1;
    width: 100%;
    padding: var(--space-m) var(--space-l);
  }
}
</style>
