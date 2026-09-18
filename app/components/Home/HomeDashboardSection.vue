<script setup lang="ts">
// Labelled section inside a dashboard card. Scaffolding for the raw-data pass
// so all five cards dump their data in a consistent shape while the real
// layout gets designed on top of it. Pass `to` and the label doubles as the
// way into the fuller view of what the section shows, same as the card title.
// Listen for `click` instead when the fuller view is a sheet or modal rather
// than a page.
defineProps<{ label: string, to?: string }>()
const emit = defineEmits<{ click: [] }>()

// Emits don't land in attrs, so the vnode is the only place to see whether
// anyone is listening. Read at render time rather than cached, since a parent
// can attach the listener conditionally and the vnode isn't reactive.
const instance = getCurrentInstance()

function clickable() {
  return Boolean(instance?.vnode.props?.onClick)
}
</script>

<template>
  <section class="dashboard-section">
    <div class="dashboard-section__head">
      <h3 class="dashboard-section__label">
        <NuxtLink v-if="to" :to="to" class="dashboard-section__link">
          {{ label }}
          <Icon name="ph:arrow-right" class="dashboard-section__arrow" />
        </NuxtLink>
        <button v-else-if="clickable()" type="button" class="dashboard-section__link" @click="emit('click')">
          {{ label }}
          <Icon name="ph:arrow-right" class="dashboard-section__arrow" />
        </button>
        <template v-else>
          {{ label }}
        </template>
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

.dashboard-section__link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xxs);
  color: inherit;
  // The button variant inherits the label's type instead of the browser's.
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    color: var(--color-text);

    .dashboard-section__arrow {
      opacity: 1;
      transform: none;
    }
  }
}

// Held back until hovered, same as the card title's arrow, so the label reads
// as a label until you reach for it.
.dashboard-section__arrow {
  font-size: 12px;
  opacity: 0;
  transform: translateX(-4px);
  transition:
    opacity var(--transition-duration) ease,
    transform var(--transition-duration) ease;
}
</style>
