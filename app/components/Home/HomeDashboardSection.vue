<script setup lang="ts">
// Labelled section inside a dashboard card. Scaffolding for the raw-data pass
// so all five cards dump their data in a consistent shape while the real
// layout gets designed on top of it.
defineProps<{ label: string }>()
</script>

<template>
  <section class="dashboard-section">
    <div class="dashboard-section__head">
      <h3 class="dashboard-section__label">
        {{ label }}
      </h3>
      <slot name="action" />
    </div>
    <slot />
  </section>
</template>

<style scoped lang="scss">
.dashboard-section {
  height: 100%;
  width: 100%;

  &:not(:last-child) {
    margin-bottom: var(--space-m);
  }

  :deep(ul) {
    list-style: none;
    padding: 0;
    margin: 0;
    // display: flex;
    // flex-direction: column;
    // gap: var(--space-xs);
  }

  :deep(p) {
    color: var(--color-text-light);
  }
}

// The label keeps its own row so a section can hang an action off the right of
// it without the action landing on top of the items.
.dashboard-section__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-s);
  min-height: 20px;
  margin-bottom: var(--space-xs);
}

.dashboard-section__label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-lighter);
  margin: 0;
}
</style>
