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
  <Card v-if="event.markdown" class="event-markdown">
    <Flex column gap="l">
      <h3 class="event-markdown__title">
        <Icon name="ph:article" />
        Event Details
      </h3>
      <Suspense suspensible>
        <template #fallback>
          <Skeleton height="50rem" />
        </template>
        <MDC :partial="true" class="event-markdown__content typeset" :value="event.markdown" />
      </Suspense>
    </Flex>
  </Card>
</template>

<style lang="scss" scoped>
.event-markdown {
  &__title {
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

  &__content {
    line-height: 1.6;
  }
}
</style>
