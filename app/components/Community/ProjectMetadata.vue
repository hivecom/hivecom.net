<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Card, Flex } from '@dolanske/vui'
import TimestampDate from '@/components/Shared/TimestampDate.vue'

defineProps<{
  project: Tables<'projects'>
}>()
</script>

<template>
  <Card class="project-metadata">
    <Flex column gap="l">
      <h3 class="project-metadata__title">
        <Icon name="ph:info" />
        Metadata
      </h3>
      <div class="project-metadata__content">
        <div class="project-metadata__timestamp-grid">
          <div class="project-metadata__timestamp-item">
            <span class="project-metadata__timestamp-label">Created</span>
            <TimestampDate size="xs" :date="project.created_at" format="MMM D, YYYY [at] HH:mm" class="project-metadata__timestamp-date" />
          </div>
          <div v-if="project.modified_at" class="project-metadata__timestamp-item">
            <span class="project-metadata__timestamp-label">Modified</span>
            <TimestampDate size="xs" :date="project.modified_at" format="MMM D, YYYY [at] HH:mm" class="project-metadata__timestamp-date" />
          </div>
        </div>
      </div>
    </Flex>
  </Card>
</template>

<style lang="scss" scoped>
.project-metadata__title {
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

.project-metadata__content {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
}

.project-metadata__timestamp-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-m);
  margin-top: var(--space-xs);
}

.project-metadata__timestamp-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-xxs);
}

.project-metadata__timestamp-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--text-color-lighter);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
</style>
