<script setup lang="ts">
import { Button, Card, Flex } from '@dolanske/vui'

interface Props {
  data: {
    themeName: string
    onKeep: (toastId: number, origin?: { x: number, y: number }) => void
    onRemove: (toastId: number, origin?: { x: number, y: number }) => void
  }
  toastId: number
}

const { data, toastId } = defineProps<Props>()
</script>

<template>
  <Card :padding="false" expand class="toast-theme-preview">
    <Flex y-center gap="s" class="toast-theme-preview__row">
      <Flex y-center x-center class="toast-theme-preview__icon">
        <Icon name="ph:flask" :size="20" />
      </Flex>
      <Flex column expand gap="xxs" class="toast-theme-preview__text">
        <span class="toast-theme-preview__label">Previewing theme</span>
        <span class="toast-theme-preview__title">{{ data.themeName }}</span>
      </Flex>
      <Flex gap="xs" y-center>
        <Button
          size="s" variant="accent" @click="(e: MouseEvent) => data.onKeep(toastId, { x: e.clientX,
                                                                                      y: e.clientY })"
        >
          Keep
        </Button>
        <Button
          size="s" variant="gray" @click="(e: MouseEvent) => data.onRemove(toastId, { x: e.clientX,
                                                                                      y: e.clientY })"
        >
          Remove
        </Button>
      </Flex>
    </Flex>
  </Card>
</template>

<style scoped lang="scss">
.toast-theme-preview {
  &__row {
    padding-inline: var(--space-xs);
    min-height: 52px;
  }

  &__icon {
    width: 32px;
    height: 32px;
    min-width: 32px;
    background-color: var(--color-bg-raised);
    border-radius: var(--border-radius-m);
    border: 1px solid var(--color-border);
    color: var(--color-text-light);
    flex-shrink: 0;
  }

  &__text {
    min-width: 0;
  }

  &__label {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
  }

  &__title {
    font-size: var(--font-size-s);
    font-weight: var(--font-weight-semibold);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
