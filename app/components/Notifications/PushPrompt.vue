<script setup lang="ts">
import { Alert, Button, Flex } from '@dolanske/vui'
import { computed, onMounted, ref } from 'vue'
import { usePushNotifications } from '@/composables/usePushNotifications'

// Persisted so we don't nag a user who chose to ignore the prompt.
const DISMISS_KEY = 'hivecom.push-prompt.dismissed'

const { isSupported, isStandalone, permission, isSubscribed, loading, subscribe, refresh } = usePushNotifications()

const dismissed = ref(true)

onMounted(async () => {
  dismissed.value = localStorage.getItem(DISMISS_KEY) === '1'
  await refresh()
})

// Only nudge inside an installed PWA where push is actually useful and the
// user hasn't already enabled, denied, or dismissed it.
const show = computed(() =>
  isSupported.value
  && isStandalone.value
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
  <Alert v-if="show" variant="info" class="push-prompt">
    <Flex column gap="s" expand>
      <Flex column gap="xxs">
        <strong class="text-s">Enable push notifications</strong>
        <span class="text-xs text-color-light">Get notified about replies, mentions, and events even when Hivecom is closed.</span>
      </Flex>
      <Flex gap="xs" y-center>
        <Button size="s" variant="accent" :loading="loading" @click="enable">
          Enable
        </Button>
        <Button size="s" variant="gray" :disabled="loading" @click="ignore">
          Ignore
        </Button>
      </Flex>
    </Flex>
  </Alert>
</template>

<style lang="scss" scoped>
.push-prompt {
  margin: var(--space-s) var(--space-s) 0;
}
</style>
