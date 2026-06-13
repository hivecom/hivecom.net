<script setup lang="ts">
import { Button, ButtonGroup, Tooltip } from '@dolanske/vui'
import { computed, onMounted, ref } from 'vue'
import { usePushNotifications } from '@/composables/usePushNotifications'
import NotificationCard from './NotificationCard.vue'

// Persisted so we don't nag a user who chose to dismiss the prompt.
const DISMISS_KEY = 'hivecom.push-prompt.dismissed'

const { isSupported, permission, isSubscribed, loading, subscribe, refresh } = usePushNotifications()

const dismissed = ref(true)

onMounted(async () => {
  dismissed.value = localStorage.getItem(DISMISS_KEY) === '1'
  await refresh()
})

// Nudge whenever push is supported on this device but not yet enabled here,
// unless the user denied permission or dismissed the callout. iOS Safari tabs
// report unsupported (push only works once installed), so they stay hidden.
const show = computed(() =>
  isSupported.value
  && permission.value !== 'denied'
  && !isSubscribed.value
  && !dismissed.value,
)

function ignore() {
  dismissed.value = true
  localStorage.setItem(DISMISS_KEY, '1')
}

async function enable() {
  const ok = await subscribe()
  // If the user blocked the permission prompt, stop nagging.
  if (!ok && permission.value === 'denied')
    ignore()
}
</script>

<template>
  <NotificationCard
    v-if="show"
    icon="ph:bell-ringing"
    text="Enable push notifications"
    class="push-prompt"
  >
    <template #below>
      <p class="push-prompt__description text-xs text-color-lighter">
        Get notified even when Hivecom is closed.
      </p>
    </template>

    <template #actions>
      <ButtonGroup :gap="2">
        <Tooltip placement="top">
          <Button
            square
            size="s"
            variant="gray"
            :disabled="loading"
            aria-label="Ignore"
            @click="ignore"
          >
            <Icon name="ph:x" />
          </Button>
          <template #tooltip>
            <p>Ignore</p>
          </template>
        </Tooltip>
        <Tooltip placement="top">
          <Button
            square
            size="s"
            variant="accent"
            :loading="loading"
            aria-label="Enable push notifications"
            @click="enable"
          >
            <Icon name="ph:check" />
          </Button>
          <template #tooltip>
            <p>Enable push notifications</p>
          </template>
        </Tooltip>
      </ButtonGroup>
    </template>
  </NotificationCard>
</template>

<style lang="scss" scoped>
.push-prompt {
  margin-bottom: var(--space-s);
  // Accent border to set the call-to-action apart from regular notifications.
  border-color: var(--color-accent);
}
</style>
