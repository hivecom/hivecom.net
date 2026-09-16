<script setup lang="ts">
import { Flex } from '@dolanske/vui'

// Empty state for a dashboard card. Quiet by design: the card has nothing to
// say, so it should read as a nudge rather than compete with the cards that do
// have something. The default slot takes the call to action.
defineProps<{ icon: string, message: string }>()
</script>

<template>
  <Flex column y-center x-center gap="s" expand class="dashboard-empty">
    <Icon :name="icon" class="dashboard-empty__icon" />
    <p class="dashboard-empty__message">
      {{ message }}
    </p>
    <slot />
  </Flex>
</template>

<style scoped lang="scss">
.dashboard-empty {
  // Take the leftover height in the card so the message lands in the middle
  // instead of hanging off the header.
  flex: 1;
  padding: var(--space-l) var(--space-m);
  text-align: center;
}

.dashboard-empty__icon {
  font-size: 24px;
  color: var(--color-text-lighter);
  opacity: 0.5;
}

.dashboard-empty__message {
  font-size: var(--font-size-s);
  color: var(--color-text-lighter);
  margin: 0;
}
</style>
