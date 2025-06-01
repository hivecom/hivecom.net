<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Card, Flex, Skeleton } from '@dolanske/vui'

interface Props {
  event: Tables<'events'>
}

defineProps<Props>()
</script>

<template>
  <!-- Event Details -->
  <Card v-if="event.markdown" class="event-details">
    <Flex column gap="l">
      <h3 class="section-title">
        <Icon name="ph:article" />
        Event Details
      </h3>
      <Suspense suspensible>
        <template #fallback>
          <Skeleton height="50rem" />
        </template>
        <MDC :partial="true" class="event-markdown-content typeset" :value="event.markdown" />
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

.event-markdown-content {
  line-height: 1.6;
}
</style>
