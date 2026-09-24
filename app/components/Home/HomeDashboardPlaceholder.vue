<script setup lang="ts">
// Sections use this instead of collapsing, so a card with little to say keeps the
// same grid as its neighbours
defineProps<{
  /** Omit for cells that only pad a grid. Use the `message` slot for copy with a link. */
  message?: string
  /** Row rather than tile */
  inline?: boolean
  /** Spans the whole grid, for an empty section */
  full?: boolean
}>()
</script>

<template>
  <div
    class="home-item home-placeholder"
    :class="{ inline,
              'home-placeholder--full': full,
              'home-placeholder--bare': !message && !$slots.message }"
  >
    <span v-if="message || $slots.message" class="home-placeholder__message">
      <slot name="message">{{ message }}</slot>
    </span>
    <slot />
  </div>
</template>

<style scoped lang="scss">
.home-placeholder {
  align-items: center;
  justify-content: center;
  gap: var(--space-s);
  padding: var(--space-s);
  background-color: transparent;
  border-style: dashed;
  text-align: center;

  // Nothing to click, so no hover response
  &:hover {
    background-color: transparent;
    border-color: var(--color-border-weak);
  }

  &:not(.inline) {
    min-height: 108px;
  }

  &.inline {
    justify-content: center;
    min-height: 44px;
  }

  // Grid padding next to real items, so the eye goes to them
  &--bare {
    opacity: 0.5;
  }

  &--full {
    grid-column: 1 / -1;
  }
}

.home-placeholder__message {
  font-size: var(--font-size-s);
  color: var(--color-text-lighter);

  a {
    color: inherit;

    &:hover {
      color: var(--color-text);
    }
  }
}
</style>
