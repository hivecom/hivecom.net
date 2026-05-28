<script setup lang="ts">
import type { ImpersonatableRole } from '@/composables/useRoleImpersonation'
import { Button, Card, Flex } from '@dolanske/vui'
import RoleIndicator from '@/components/Shared/RoleIndicator.vue'

interface Props {
  data: {
    role: ImpersonatableRole
    onStop: (toastId: number) => void
  }
  toastId: number
}

const { data, toastId } = defineProps<Props>()
</script>

<template>
  <Card :padding="false" expand class="toast-impersonate">
    <Flex y-center gap="s" class="toast-impersonate__row">
      <Flex y-center x-center class="toast-impersonate__icon">
        <Icon name="ph:user-switch" :size="20" />
      </Flex>
      <Flex column gap="xxs" class="toast-impersonate__text">
        <span class="toast-impersonate__label">Impersonating</span>
        <RoleIndicator :role="data.role" tiny />
      </Flex>
      <Flex gap="xs" y-center class="toast-impersonate__actions">
        <Button size="s" variant="gray" @click="data.onStop(toastId)">
          Reset
        </Button>
      </Flex>
    </Flex>
  </Card>
</template>

<style scoped lang="scss">
.toast-impersonate {
  &__row {
    padding-inline: var(--space-xs);
    min-height: 52px;
    min-width: 0;
  }

  &__icon {
    width: 32px;
    height: 32px;
    min-width: 32px;
    background-color: var(--color-bg-raised);
    border-radius: var(--border-radius-m);
    border: 1px solid var(--color-border);
    color: var(--color-text-yellow);
    flex-shrink: 0;
  }

  &__text {
    flex: 1;
    width: 0;
    min-width: 0;
  }

  &__actions {
    flex-shrink: 0;
  }

  &__label {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
  }
}
</style>
