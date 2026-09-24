<script setup lang="ts">
import { Flex } from '@dolanske/vui'

// Quiet on purpose, so it doesn't compete with cards that have something to say.
// The default slot takes the call to action.
defineProps<{ message: string }>()
</script>

<template>
  <Flex column y-center x-center gap="s" expand class="dashboard-empty">
    <p class="dashboard-empty__message">
      {{ message }}
    </p>
    <slot />
  </Flex>
</template>

<style scoped lang="scss">
.dashboard-empty {
  // Centres the message in the leftover height instead of hanging off the header
  flex: 1;
  padding: var(--space-l) var(--space-m);
  text-align: center;
}

.dashboard-empty__message {
  font-size: var(--font-size-s);
  color: var(--color-text-lighter);
  margin: 0;
}
</style>
