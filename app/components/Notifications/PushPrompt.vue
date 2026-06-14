<script setup lang="ts">
import { Button, ButtonGroup, Tooltip } from '@dolanske/vui'
import { computed, onMounted, ref } from 'vue'
import { usePushNotifications } from '@/composables/usePushNotifications'
import NotificationCard from './NotificationCard.vue'

const props = withDefaults(defineProps<{
  // 'active' shows the call-to-action until dismissed; 'past' shows the dismissed
  // reminder so users can still re-enable without digging into settings.
  context?: 'active' | 'past'
}>(), {
  context: 'active',
})

// Persisted so we don't nag a user who chose to dismiss the prompt.
const DISMISS_KEY = 'hivecom.push-prompt.dismissed'

const { isSupported, permission, isSubscribed, loading, subscribe, refresh } = usePushNotifications()
const userId = useUserId()

const dismissed = ref(true)
// `refresh()` sets `isSupported`/`permission` synchronously but only updates
// `isSubscribed` after the async subscription lookup resolves. Without this gate
// an already-subscribed user sees the prompt flash for a frame. Stay hidden
// until the subscription state is actually known.
const ready = ref(false)

onMounted(async () => {
  dismissed.value = localStorage.getItem(DISMISS_KEY) === '1'
  await refresh()
  ready.value = true
})

// Push is relevant whenever it's supported on this device but not yet enabled
// here, the user is signed in, and they haven't blocked the permission. iOS
// Safari tabs report unsupported (push only works once installed), so they stay
// hidden everywhere.
const available = computed(() =>
  Boolean(userId.value)
  && isSupported.value
  && permission.value !== 'denied'
  && !isSubscribed.value,
)

// Active surface shows the prompt until dismissed; the Past surface only shows
// the dismissed reminder.
const show = computed(() =>
  ready.value
  && available.value
  && (props.context === 'past' ? dismissed.value : !dismissed.value),
)

const isPast = computed(() => props.context === 'past')

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
    :class="{ 'push-prompt--muted': isPast }"
  >
    <template #below>
      <p class="push-prompt__description text-xs text-color-lighter">
        Get notified even when Hivecom is closed.
      </p>
    </template>

    <template #actions>
      <ButtonGroup :gap="2">
        <Tooltip v-if="!isPast" placement="top">
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
  // Accent border to set the call-to-action apart from regular notifications.
  border-color: var(--color-accent);

  // On the Past tab it's a quiet reminder, not a fresh call-to-action.
  &--muted {
    border-color: var(--color-border);
  }
}
</style>
