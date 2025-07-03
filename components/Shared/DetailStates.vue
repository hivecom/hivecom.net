<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import { Button, Card, Flex, Skeleton } from '@dolanske/vui'

interface Props {
  loading: boolean
  error: string | null
  backTo: RouteLocationRaw
  backLabel: string
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
    <Button
      variant="accent"
      :aria-label="`Go back to ${backLabel}`"
      @click="$router.push(backTo)"
    >
      <template #start>
        <Icon name="ph:arrow-left" />
      </template>
      {{ backLabel }}
    </Button>
    <Card>
      <Flex column gap="m" x-center>
        <Icon name="ph:warning-circle" size="48" class="detail-states__error-icon" />
        <h3>{{ error }}</h3>
        <p class="detail-states__error-message">
          <slot name="error-message">
            The resource you're looking for might have been removed or doesn't exist.
          </slot>
        </p>
      </Flex>
    </Card>
  </div>
</template>

<style lang="scss" scoped>
.detail-states {
  &__loading,
  &__error {
    .card {
      padding: var(--space-xl);
    }
  }

  &__error-icon {
    color: var(--color-text-red);
  }

  &__error-message {
    color: var(--color-text-lightest);
    text-align: center;
    margin: 0;
  }
}
</style>
