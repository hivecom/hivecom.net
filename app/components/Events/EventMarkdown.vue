<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Card, Flex } from '@dolanske/vui'
import MDRenderer from '@/components/Shared/MDRenderer.vue'
import MetadataCard from '../Shared/MetadataCard.vue'

interface Props {
  event: Tables<'events'>
}

const props = defineProps<Props>()
</script>

<template>
  <!-- Event Details -->
  <Card v-if="props.event.markdown" class="event-markdown card-bg">
    <Flex column gap="l" class="event-markdown__content">
      <MDRenderer :md="props.event.markdown" />
    </Flex>
    <MetadataCard
      :created-at="event.created_at"
      :created-by="event.created_by"
      :modified-at="event.modified_at"
      :modified-by="event.modified_by"
    />
  </Card>
</template>

<style lang="scss" scoped>
.event-markdown {
  &__title {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    font-size: var(--font-size-l);
    font-weight: var(--font-weight-semibold);
    // margin: 0;
    color: var(--color-text);

    svg {
      color: var(--color-accent);
    }
  }

  &__content {
    padding: var(--space-m);
    /* max-width: 728px; */
    margin-bottom: var(--space-xl);
  }
}
</style>
