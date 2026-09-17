<script setup lang="ts">
// The shape an item would take, with the reason it isn't there yet written in
// it. Sections use this instead of collapsing, so a card with little to say
// keeps the same grid as the cards either side of it rather than turning into a
// column of grey sentences.
defineProps<{
  /** Left out for the cells that only pad a partly filled grid. Use the
   * `message` slot instead when the copy carries a link. */
  message?: string
  /** Row rather than tile, for the sections that are a list. */
  inline?: boolean
  /** Span the whole grid, for a section with nothing in it at all. */
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

  // Nothing to click, so it shouldn't answer the cursor like a real item does.
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

  // Padding out a grid that has real items in it. No copy, just the shape, so
  // the eye goes to the item next to it.
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

  // A link inside the copy reads as part of the sentence, just underlined, and
  // steps up to normal text on hover so it's clearly the part that answers.
  a {
    color: inherit;

    &:hover {
      color: var(--color-text);
    }
  }
}
</style>
