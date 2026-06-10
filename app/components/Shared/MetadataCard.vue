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
      <Flex expand x-between y-center wrap class="metadata-card__header pr-m">
        <h3 class="metadata-card__title">
          <Icon name="ph:info" />
          Metadata
        </h3>
        <Flex v-if="tags && tags.length > 0" wrap x-end gap="xs">
          <Badge
            v-for="tag in tags"
            :key="tag"
            variant="neutral"
            outline
          >
            <span class="text-color-light text-xs">
              {{ tag }}
            </span>
          </Badge>
        </Flex>
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
.metadata-card :deep(.vui-accordion-header) {
  padding-block: var(--space-s);
}

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
  color: var(--color-text-light);

  svg {
    color: var(--color-accent);
  }
}
</style>
