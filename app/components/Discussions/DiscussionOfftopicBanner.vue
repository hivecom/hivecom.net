<script setup lang="ts">
import { Button } from '@dolanske/vui'

defineProps<{
  count: number
}>()

const emit = defineEmits<{
  show: []
}>()
</script>

<template>
  <div class="discussion-offtopic-banner" @click="emit('show')">
    <Button plain size="s">
      {{ count }} off-topic {{ count === 1 ? 'reply' : 'replies' }} hidden
      <template #end>
        <Icon name="ph:caret-down" :size="12" />
      </template>
    </Button>
  </div>
</template>

<style scoped lang="scss">
.discussion-offtopic-banner {
  width: 100%;
  position: relative;
  display: flex;
  justify-content: center;
  margin-block: var(--space-s);
  cursor: pointer;

  &:before {
    content: '';
    display: block;
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    left: 0;
    right: 0;
    border-bottom: 1px dashed var(--color-border);
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
    color: var(--color-text-yellow);
    font-size: var(--font-size-xs);
  }
}
</style>
