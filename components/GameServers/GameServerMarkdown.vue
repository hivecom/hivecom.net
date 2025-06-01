<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Card, Flex, Skeleton } from '@dolanske/vui'

interface Props {
  gameserver: Tables<'gameservers'>
}

defineProps<Props>()
</script>

<template>
  <!-- Server Details (Markdown) -->
  <Card v-if="gameserver.markdown" class="server-markdown">
    <Flex column gap="l">
      <h3 class="section-title">
        <Icon name="ph:article" />
        Server Details
      </h3>
      <Suspense suspensible>
        <template #fallback>
          <Skeleton height="50rem" />
        </template>
        <MDC :partial="true" class="gameserver-markdown-content typeset" :value="gameserver.markdown" />
      </Suspense>
    </Flex>
  </Card>
</template>

<style lang="scss" scoped>
.section-title {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  font-size: var(--font-size-xl);
  font-weight: 600;
  margin: 0;
  color: var(--color-text);

  svg {
    color: var(--color-accent);
  }
}

.gameserver-markdown-content {
  line-height: 1.6;
}
</style>
