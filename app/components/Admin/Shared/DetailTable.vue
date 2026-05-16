<script setup lang="ts">
interface Props {
  /**
   * When true, renders without the card border/background - just the striped rows.
   * Use this when DetailTable is nested inside an existing Card.
   */
  bare?: boolean
}

withDefaults(defineProps<Props>(), {
  bare: false,
})
</script>

<template>
  <div class="detail-table" :class="{ 'detail-table--bare': bare }">
    <div v-if="$slots.header" class="detail-table__header">
      <slot name="header" />
    </div>
    <slot />
  </div>
</template>

<style scoped lang="scss">
.detail-table {
  display: flex;
  flex-direction: column;
  width: 100%;
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);
  overflow: hidden;

  &__header {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-s) var(--space-m);
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text);
    font-weight: 600;
  }

  // Stripe every other row.
  :deep(.detail-row:nth-child(even)) {
    background-color: var(--color-bg-raised);
  }

  &--bare {
    background-color: transparent;
    border: none;
    border-radius: 0;
    // Extend rows flush to the card's inner edges by countering its padding.
    margin: calc(-1 * var(--space-m));
    width: calc(100% + 2 * var(--space-m));
  }
}
</style>
