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
    <Spinner
      v-if="loading" size="s" style="z-index: 10;"
    />
    <Button v-else plain size="s" :disabled="loading">
      <template v-if="!loading" #start>
        <Icon name="ph:arrow-down" :size="12" />
      </template>
      {{ remainingCount && remainingCount > 0 ? `${remainingCount} more ${remainingCount === 1 ? 'reply' : 'replies'}` : 'Load more' }}
      <template v-if="!loading" #end>
        <Icon name="ph:arrow-down" :size="12" />
      </template>
    </Button>
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

  &:hover:before {
    opacity: 1;
  }

  :deep(.vui-button) {
    position: relative;
    z-index: 3;
    background-color: var(--color-bg);
    color: var(--color-text-lighter);
    font-size: var(--font-size-xs);

    &:hover:not(:disabled) {
      color: var(--color-text);
    }
  }
}
</style>
