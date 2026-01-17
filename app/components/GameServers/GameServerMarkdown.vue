<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Card, Flex } from '@dolanske/vui'
import MDRenderer from '@/components/Shared/MDRenderer.vue'
import MetadataCard from '../Shared/MetadataCard.vue'

interface Props {
  gameserver: Tables<'gameservers'>
}

defineProps<Props>()
</script>

<template>
  <!-- Server Details (Markdown) -->
  <Card v-if="gameserver.markdown" class="gameserver-markdown card-bg ">
    <Flex column gap="l" class="p-l">
      <strong class="gameserver-markdown__title">
        <Icon name="ph:article" />
        Server Details
      </strong>
      <MDRenderer :md="gameserver.markdown" class="gameserver-markdown__content" />
    </Flex>

    <!-- Server Metadata -->
    <MetadataCard
      :created-at="gameserver.created_at"
      :created-by="gameserver.created_by"
      :modified-at="gameserver.modified_at"
      :modified-by="gameserver.modified_by"
    />
  </Card>
</template>

<style lang="scss" scoped>
.gameserver-markdown {
  &__title {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    font-size: var(--font-size-m);
    margin: 0;
    color: var(--color-text-light);

    svg {
      color: var(--color-accent);
    }
  }

  &__content {
    padding: var(--space-m);
    max-width: 728px;
    margin-bottom: var(--space-xl);
  }
}
</style>
