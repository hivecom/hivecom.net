<script setup lang="ts">
import UserAvatar from '@/components/Shared/UserAvatar.vue'

const props = withDefaults(defineProps<{
  userId: string
  size?: 's' | 'm' | 'l' | number
}>(), {
  size: 's',
})

// The crown tracks the avatar so it stays a marker rather than growing into a
// second focal point on the larger cards.
const badgeSize = computed(() => {
  const avatar = typeof props.size === 'number'
    ? props.size
    : { s: 28, m: 40, l: 48 }[props.size]

  return Math.round(Math.max(12, Math.min(20, avatar * 0.45)))
})
</script>

<template>
  <span class="event-host" :style="{ '--host-badge-size': `${badgeSize}px` }">
    <UserAvatar :user-id="props.userId" :size="props.size" show-preview />
    <span class="event-host__badge">
      <Icon name="ph:crown-simple-fill" :size="badgeSize - 5" />
    </span>
  </span>
</template>

<style lang="scss" scoped>
// Sits above the attendee cluster so the avatar next to it can't cover the crown.
.event-host {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  z-index: 2;

  &__badge {
    position: absolute;
    right: -2px;
    bottom: -2px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--host-badge-size);
    height: var(--host-badge-size);
    border-radius: var(--border-radius-pill);
    // Kills the inline baseline gap under the glyph, which otherwise sits the
    // crown low in the circle.
    line-height: 0;
    // Cut out of the card instead of sitting on it, so the crown reads as a
    // marker rather than a filled blob.
    background-color: var(--color-bg);
    border: 1px solid var(--color-border);
    color: var(--color-border);

    :deep(svg) {
      display: block;
    }
  }
}
</style>
