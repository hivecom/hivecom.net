<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Card, Flex } from '@dolanske/vui'
import MDRenderer from '~/components/Shared/MDRenderer.vue'

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
      <MDRenderer :md="event.markdown" class="event-markdown__content" />
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
    font-weight: var(--font-weight-semibold);
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
