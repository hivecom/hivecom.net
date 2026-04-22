<script setup lang="ts">
import { Button } from '@dolanske/vui'
import { computed } from 'vue'

const props = defineProps<{
  count: number
  loading: boolean
  model: 'comment' | 'forum'
}>()

const emit = defineEmits<{
  load: []
}>()

const icon = computed(() => props.model === 'comment' ? 'ph:arrow-up' : 'ph:arrow-down')
const nounSingular = computed(() => props.model === 'comment' ? 'comment' : 'reply')
const nounPlural = computed(() => props.model === 'comment' ? 'comments' : 'replies')
const noun = computed(() => props.count === 1 ? nounSingular.value : nounPlural.value)

function handleClick() {
  if (!props.loading) {
    emit('load')
  }
}
</script>

<template>
  <div class="discussion-pending-banner" @click="handleClick">
    <Button plain size="s" :disabled="loading">
      <template #start>
        <Icon :name="icon" :size="12" />
      </template>
      Click to load {{ count }} new {{ noun }}
      <template #end>
        <Icon :name="icon" :size="12" />
      </template>
    </Button>
  </div>
</template>

<style scoped lang="scss">
.discussion-pending-banner {
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
    border-bottom: 1px solid var(--color-border);
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
}
</style>
