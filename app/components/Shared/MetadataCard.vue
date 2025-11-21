<script setup lang="ts">
import { Accordion, Badge, Flex } from '@dolanske/vui'
import Metadata from '@/components/Shared/Metadata.vue'

interface Props {
  createdAt: string
  createdBy?: string | null
  modifiedAt?: string | null
  modifiedBy?: string | null
  tags?: string[] | null
  loading?: boolean
}

defineProps<Props>()
</script>

<template>
  <Accordion class="metadata-card" card>
    <template #header>
      <Flex expand x-between y-center class="metadata-card__header">
        <h3 class="metadata-card__title">
          <Icon name="ph:info" />
          Metadata
        </h3>
        <div v-if="tags && tags.length > 0" class="metadata-card__tags">
          <Badge
            v-for="tag in tags"
            :key="tag"
            size="xs"
            variant="neutral"
          >
            {{ tag }}
          </Badge>
        </div>
      </Flex>
    </template>
    <Flex column gap="l">
      <Metadata
        :created-at="createdAt"
        :created-by="createdBy"
        :modified-at="modifiedAt"
        :modified-by="modifiedBy"
        :loading="loading"
      />
    </Flex>
  </Accordion>
</template>

<style lang="scss" scoped>
.metadata-card__header {
  width: 100%;
}

.metadata-card__title {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  font-size: var(--font-size-m);
  font-weight: var(--font-weight-semibold);
  margin: 0;
  color: var(--text-color-light);

  svg {
    color: var(--color-accent);
  }
}

.metadata-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}
</style>
