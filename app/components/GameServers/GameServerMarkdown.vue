<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Card, Flex } from '@dolanske/vui'
import MDRenderer from '@/components/Shared/MDRenderer.vue'

interface Props {
  gameserver: Tables<'gameservers'>
}

defineProps<Props>()
</script>

<template>
  <!-- Server Details (Markdown) -->
  <Card v-if="gameserver.markdown" class="gameserver-markdown">
    <Flex column gap="l">
      <strong class="gameserver-markdown__title">
        <Icon name="ph:article" />
        Server Details
      </strong>
      <MDRenderer :md="gameserver.markdown" class="gameserver-markdown__content" />
    </Flex>
  </Card>
</template>

<style lang="scss" scoped>
.gameserver-markdown {
  &__title {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    font-size: var(--font-size-m);
    // font-weight: var(--font-weight-semibold);
    margin: 0;
    color: var(--text-color-light);

    svg {
      color: var(--color-accent);
    }
  }

  &__content {
    line-height: 1.6;
    max-width: 512px;
    margin: auto;
  }
}
</style>
