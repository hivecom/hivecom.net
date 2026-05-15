<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import { Button, Card, Flex, Skeleton } from '@dolanske/vui'
import ErrorAlert from '@/components/Shared/ErrorAlert.vue'

interface Props {
  loading: boolean
  error: string | null
  backTo: RouteLocationRaw | (() => void)
  backLabel: string
  errorMessage?: string
}

defineProps<Props>()
</script>

<template>
  <!-- Loading State -->
  <div v-if="loading" class="detail-states__loading">
    <Card>
      <Flex column gap="l">
        <Skeleton height="2rem" width="60%" />
        <Skeleton height="1rem" width="100%" />
        <Skeleton height="1rem" width="80%" />
        <Skeleton height="200px" width="100%" />
      </Flex>
    </Card>
  </div>

  <!-- Error State -->
  <div v-else-if="error" class="detail-states__error">
    <Flex>
      <Button
        variant="accent"
        plain
        :aria-label="backLabel"
        @click="typeof backTo === 'function' ? backTo() : navigateTo(backTo)"
      >
        <template #start>
          <Icon name="ph:arrow-left" />
        </template>
        {{ backLabel }}
      </Button>
    </Flex>
    <ErrorAlert standalone :message="error" :error="errorMessage" />
  </div>
</template>

<style lang="scss" scoped>
.detail-states {
  &__loading {
    .card {
      padding: var(--space-xl);
    }
  }

  &__error {
    display: flex;
    flex-direction: column;
    gap: var(--space-m);
  }
}
</style>
