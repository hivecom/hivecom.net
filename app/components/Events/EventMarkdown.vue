<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Card } from '@dolanske/vui'
import MarkdownRenderer from '@/components/Shared/MarkdownRenderer.vue'
import MetadataCard from '../Shared/MetadataCard.vue'

interface Props {
  event: Tables<'events'>
}

const props = defineProps<Props>()
</script>

<template>
  <!-- Event Details -->
  <Card v-if="props.event.markdown" class="event-markdown card-bg">
    <div class="event-markdown__content">
      <MarkdownRenderer :md="props.event.markdown" />
    </div>
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
    padding-bottom: var(--space-m);
  }
}
</style>
