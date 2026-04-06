<script setup lang="ts">
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
    <button :disabled="loading" @click="emit('loadUp')">
      <Icon name="ph:arrow-up" :size="12" />
      Load up
    </button>

    <span class="discussion-gap-banner__count">
      {{ count }} {{ count === 1 ? 'reply' : 'replies' }}
    </span>

    <button :disabled="loading" @click="emit('loadDown')">
      Load down
      <Icon name="ph:arrow-down" :size="12" />
    </button>
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
    border-bottom: 1px solid var(--color-accent);
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
    color: var(--color-accent);
    cursor: pointer;
    transition: color var(--transition);

    &:hover:not(:disabled) {
      color: var(--color-accent);
      opacity: 0.8;
    }

    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
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
```

Now let me run diagnostics on the file.
