<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Card, Flex, Grid } from '@dolanske/vui'
import TimestampDate from '@/components/Shared/TimestampDate.vue'

defineProps<{
  project: Tables<'projects'>
}>()
</script>

<template>
  <Card class="project-metadata">
    <Flex column gap="l">
      <Flex y-center gap="s" class="project-metadata__title">
        <Icon name="ph:info" class="text-color-accent" />
        <h3 class="text-xl text-semibold">
          Metadata
        </h3>
      </Flex>
      <Grid :columns="2" gap="m">
        <Flex column gap="xxs">
          <span class="project-metadata__timestamp-label">Created</span>
          <TimestampDate size="xs" :date="project.created_at" format="MMM D, YYYY [at] HH:mm" />
        </Flex>
        <Flex v-if="project.modified_at" column gap="xxs">
          <span class="project-metadata__timestamp-label">Modified</span>
          <TimestampDate size="xs" :date="project.modified_at" format="MMM D, YYYY [at] HH:mm" />
        </Flex>
      </Grid>
    </Flex>
  </Card>
</template>

<style lang="scss" scoped>
.project-metadata__timestamp-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-lighter);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
</style>
