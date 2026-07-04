<script setup lang="ts">
// Labelled section inside a dashboard card. Scaffolding for the raw-data pass
// so all five cards dump their data in a consistent shape while the real
// layout gets designed on top of it.
defineProps<{ label: string }>()
</script>

<template>
  <section class="dashboard-section">
    <h3 class="dashboard-section__label">
      {{ label }}
    </h3>
    <slot />
  </section>
</template>

<style scoped lang="scss">
.dashboard-section {
  &:not(:last-child) {
    margin-bottom: var(--space-m);
  }

  :deep(ul) {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  :deep(p) {
    color: var(--color-text-light);
  }
}

.dashboard-section__label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-lighter);
  margin-bottom: var(--space-xs);
}
</style>
