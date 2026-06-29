<script setup lang="ts">
import { Button, Flex } from '@dolanske/vui'
import { computed } from 'vue'
import { useIrcChat } from '@/composables/useIrcChat'

const { connState, connect, disconnect } = useIrcChat()

// 'connecting' auto-retries on its own, so just reassure the user. 'offline' and
// 'error' mean we gave up retrying - offer a manual retry and a way out.
const stalled = computed(() => connState.value === 'offline' || connState.value === 'error')
</script>

<template>
  <Flex y-center x-between gap="s" class="reconnect-banner" expand>
    <Flex y-center gap="s" class="reconnect-banner__content">
      <Icon
        :name="stalled ? 'ph:wifi-slash' : 'ph:arrows-clockwise'"
        class="reconnect-banner__icon"
        :class="[stalled ? 'text-color-red' : 'text-color-yellow', { 'reconnect-banner__icon--spin': !stalled }]"
        :size="18"
      />
      <span class="text-s">
        {{ stalled ? 'Connection lost. Showing your last messages.' : 'Reconnecting...' }}
      </span>
    </Flex>
    <Flex v-if="stalled" gap="xs" class="reconnect-banner__actions">
      <Button variant="gray" size="s" @click="disconnect()">
        Go back
      </Button>
      <Button variant="accent" size="s" @click="connect()">
        <template #start>
          <Icon name="ph:arrows-clockwise" />
        </template>
        Retry
      </Button>
    </Flex>
  </Flex>
</template>

<style lang="scss" scoped>
.reconnect-banner {
  padding: var(--space-xs) var(--space-m);
  background: var(--color-bg-lowered);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;

  &__content {
    min-width: 0;
  }

  &__icon {
    flex-shrink: 0;

    &--spin {
      animation: reconnect-spin 1.4s linear infinite;
    }
  }

  &__actions {
    flex-shrink: 0;
  }
}

@keyframes reconnect-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
