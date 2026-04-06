<script setup lang="ts">
import { Spinner } from '@dolanske/vui'

const props = defineProps<{
  loading: boolean
  remainingCount?: number
}>()

const emit = defineEmits<{
  load: []
}>()

function handleClick() {
  if (!props.loading) {
    emit('load')
  }
}
</script>

<template>
  <div class="discussion-load-more" @click="handleClick">
    <button :disabled="loading">
      <template v-if="loading">
        <Spinner size="s" />
      </template>
      <template v-else>
        <Icon name="ph:arrow-down" :size="12" />
        {{ remainingCount && remainingCount > 0 ? `${remainingCount} more ${remainingCount === 1 ? 'reply' : 'replies'}` : 'Load more' }}
        <Icon name="ph:arrow-down" :size="12" />
      </template>
    </button>
  </div>
</template>

<style scoped lang="scss">
.discussion-load-more {
  width: 100%;
  position: relative;
  display: flex;
  justify-content: center;
  margin-block: var(--space-s);
  cursor: pointer;

  &:hover:before {
    opacity: 1;
  }

  &:before {
    content: '';
    display: block;
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    left: 0;
    right: 0;
    border-bottom: 1px solid var(--color-border-strong);
    opacity: 0.5;
    z-index: 1;
    transition: opacity var(--transition);
  }

  button {
    position: relative;
    z-index: 3;
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: 0 var(--space-s);
    border: none;
    background-color: var(--color-bg);
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    cursor: pointer;
    transition: color var(--transition);

    &:hover:not(:disabled) {
      color: var(--color-text);
    }

    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
  }
}
</style>
