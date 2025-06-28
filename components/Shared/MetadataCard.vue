<script setup lang="ts">
import { Badge, Card, Flex } from '@dolanske/vui'
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
  <Card class="metadata-card">
    <Flex column gap="l">
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
      <Metadata
        :created-at="createdAt"
        :created-by="createdBy"
        :modified-at="modifiedAt"
        :modified-by="modifiedBy"
        :loading="loading"
      />
    </Flex>
  </Card>
</template>

<style lang="scss" scoped>
.metadata-card__header {
  width: 100%;
}

.metadata-card__title {
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

.metadata-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}
</style>
