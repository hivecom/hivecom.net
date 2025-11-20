<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Card, Flex } from '@dolanske/vui'
import Metadata from '@/components/Shared/Metadata.vue'

interface Props {
  event: Tables<'events'>
}

defineProps<Props>()
</script>

<template>
  <Card class="event-metadata">
    <Flex column gap="l">
      <h3 class="event-metadata__title">
        <Icon name="ph:info" />
        Metadata
      </h3>
      <Metadata
        :created-at="event.created_at"
        :created-by="event.created_by"
        :modified-at="event.modified_at"
        :modified-by="event.modified_by"
      />
    </Flex>
  </Card>
</template>

<style lang="scss" scoped>
.event-metadata__title {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  margin: 0;
  color: var(--text-color);

  svg {
    color: var(--color-accent);
  }
}
</style>
