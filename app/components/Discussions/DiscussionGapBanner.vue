<script setup lang="ts">
import { Button } from '@dolanske/vui'

defineProps<{
  count: number
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'loadUp'): void
  (e: 'loadDown'): void
}>()
</script>

<template>
  <div class="discussion-gap-banner">
    <Button plain size="s" :disabled="loading" @click="emit('loadUp')">
      <template #start>
        <Icon name="ph:arrow-up" :size="12" />
      </template>
      Load up
    </Button>

    <span class="discussion-gap-banner__count">
      {{ count }} more {{ count === 1 ? 'reply' : 'replies' }} between
    </span>

    <Button plain size="s" :disabled="loading" @click="emit('loadDown')">
      Load down
      <template #end>
        <Icon name="ph:arrow-down" :size="12" />
      </template>
    </Button>
  </div>
</template>

<style scoped lang="scss">
.discussion-gap-banner {
  width: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-s);
  margin-block: var(--space-s);
  cursor: default;

  &:before {
    content: '';
    display: block;
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    left: 0;
    right: 0;
    border-bottom: 1px dashed var(--color-accent);
    opacity: 0.5;
    z-index: 1;
    transition: opacity var(--transition);
  }

  &:hover:before {
    opacity: 1;
  }

  :deep(.vui-button) {
    position: relative;
    z-index: 3;
    background-color: var(--color-bg);
    color: var(--color-accent);
    font-size: var(--font-size-xs);
  }

  &__count {
    position: relative;
    z-index: 3;
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    background-color: var(--color-bg);
    padding: 0 var(--space-xs);
    white-space: nowrap;
  }
}
</style>
