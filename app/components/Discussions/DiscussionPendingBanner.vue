<script setup lang="ts">
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
    <button :disabled="loading">
      <Icon :name="icon" :size="12" />
      Click to load {{ count }} new {{ noun }}
      <Icon :name="icon" :size="12" />
    </button>
  </div>
</template>

<style scoped lang="scss">
.discussion-pending-banner {
  width: 100%;
  position: relative;
  display: flex;
  justify-content: center;
  margin-bottom: var(--space-s);
  cursor: pointer;

  &:before {
    content: '';
    display: block;
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    left: 0;
    right: 0;
    border-bottom: 1px solid var(--color-accent);
    opacity: 0.5;
    z-index: 1;
    transition: opacity var(--transition);
  }

  &:hover:before {
    opacity: 1;
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
    color: var(--color-accent);
    cursor: pointer;
    transition: color var(--transition);

    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
  }
}
</style>
```

Now let me run diagnostics on the file.
