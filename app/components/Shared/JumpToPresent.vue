<script setup lang="ts">
// Floating "jump to present" pill that fades in when the user has scrolled away
// from the newest content. Used by the chat message log and the forum timeline.
withDefaults(defineProps<{
  /** Controls visibility; the fade transition is handled internally. */
  visible: boolean
  /** Pill label. */
  label?: string
  /** Leading icon name. */
  icon?: string
  /**
   * `absolute` anchors to the nearest positioned ancestor (chat's scroll area);
   * `fixed` anchors to the viewport (forum, which scrolls the whole window).
   */
  position?: 'absolute' | 'fixed'
}>(), {
  label: 'Jump to present',
  icon: 'ph:arrow-down',
  position: 'absolute',
})

defineEmits<{ click: [] }>()
</script>

<template>
  <Transition name="jump-to-present">
    <button
      v-if="visible"
      type="button"
      class="jump-to-present"
      :class="`jump-to-present--${position}`"
      @click="$emit('click')"
    >
      <Icon :name="icon" size="14" />
      {{ label }}
    </button>
  </Transition>
</template>

<style lang="scss" scoped>
.jump-to-present {
  position: absolute;
  bottom: var(--space-s);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: var(--space-xxs);
  padding: var(--space-xxs) var(--space-s);
  background: var(--color-bg-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-l);
  color: var(--color-text-light);
  font-size: var(--font-size-xs);
  cursor: pointer;
  white-space: nowrap;
  z-index: var(--z-active);
  transition:
    background var(--transition),
    color var(--transition);

  &--fixed {
    position: fixed;
    bottom: var(--space-m);
    // Draw above the floating reply composer (sticky, --z-sticky), which would
    // otherwise cover the pill at the bottom of the viewport. Stays below
    // nav/overlays/modals so those still occlude it as expected.
    z-index: calc(var(--z-sticky) + 1);
  }

  &:hover {
    background: var(--color-bg-medium);
    color: var(--color-text);
  }
}

.jump-to-present-enter-active,
.jump-to-present-leave-active {
  transition:
    opacity var(--transition),
    transform var(--transition);
}

.jump-to-present-enter-from,
.jump-to-present-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(4px);
}
</style>
