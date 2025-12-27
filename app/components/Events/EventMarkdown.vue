<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Card, Flex } from '@dolanske/vui'
import MDRenderer from '@/components/Shared/MDRenderer.vue'

interface Props {
  event: Tables<'events'>
}

const props = defineProps<Props>()
</script>

<template>
  <!-- Event Details -->
  <Card v-if="props.event.markdown" class="event-markdown">
    <Flex column gap="l" class="event-markdown__content">
      <!-- <h3 class="event-markdown__title">
        <Icon name="ph:article" />
        Event Details
      </h3> -->
      <MDRenderer :md="props.event.markdown" />
    </Flex>
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
    max-width: 728px;

    :deep(.typeset > :first-child) {
      margin-top: 0 !important;
    }
  }
}
</style>
