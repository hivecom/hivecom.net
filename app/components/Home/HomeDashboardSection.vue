<script setup lang="ts">
// `to` makes the label a link to the fuller view. Listen for `click` when that
// view is a sheet or modal: a caret replaces the arrow that means "this navigates".
defineProps<{ label: string, to?: string }>()
const emit = defineEmits<{ click: [] }>()

// Emits don't land in attrs, so the vnode is the only place to see a listener.
// Read at render time, since the vnode isn't reactive.
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
        </button>
        <template v-else>
          {{ label }}
        </template>
      </h3>

      <div class="dashboard-section__actions">
        <!-- Ahead of the slot so the caret stays next to its label -->
        <button
          v-if="clickable()"
          type="button"
          class="dashboard-section__expand"
          :aria-label="`Open ${label}`"
          @click="emit('click')"
        >
          <Icon name="ph:caret-up-down" />
        </button>
        <slot name="action" />
      </div>
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

.dashboard-section__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-s);
  min-height: 20px;
  margin-bottom: var(--space-xs);
}

.dashboard-section__actions {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  flex-shrink: 0;
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
  // The button variant inherits the label's type instead of the browser's
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

// Hidden until hover, so the label reads as a label until you reach for it
.dashboard-section__arrow {
  font-size: 12px;
  opacity: 0;
  transform: translateX(-4px);
  transition:
    opacity var(--transition-duration) ease,
    transform var(--transition-duration) ease;
}

// Shows on hover anywhere in the section. Always visible on touch.
.dashboard-section__expand {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--color-text-lighter);
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  opacity: 0;
  transition:
    opacity var(--transition-duration) ease,
    color var(--transition-duration) ease;

  &:hover,
  &:focus-visible {
    color: var(--color-text);
  }

  &:focus-visible {
    opacity: 1;
  }

  .dashboard-section:hover & {
    opacity: 1;
  }

  @media (hover: none) {
    opacity: 1;
  }
}
</style>
