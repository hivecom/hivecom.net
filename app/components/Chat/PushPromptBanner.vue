<script setup lang="ts">
import { Button, Flex } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import { useErgoPush } from '@/composables/useErgoPush'
import { useIrcChat } from '@/composables/useIrcChat'
import { usePwa } from '@/composables/usePwa'

const DISMISSED_KEY = 'hivecom.chat.push-prompt-dismissed'

const { account, accountAlwaysOn, accountInfoFetched, vapidKey } = useIrcChat()
const { isSupported: pushSupported, isSubscribed: pushSubscribed, subscriptionResolved: pushResolved, loading: pushLoading, subscribe: subscribePush } = useErgoPush()
const { isStandalone } = usePwa()

const dismissed = ref(false)

function dismissalKey(): string {
  return `${DISMISSED_KEY}:${account.value}`
}

function loadDismissed() {
  if (!import.meta.client || !account.value)
    return
  dismissed.value = localStorage.getItem(dismissalKey()) === '1'
}

function dismiss() {
  dismissed.value = true
  if (import.meta.client && account.value)
    localStorage.setItem(dismissalKey(), '1')
}

watch(account, () => loadDismissed(), { immediate: true })

const visible = computed(() => {
  if (!isStandalone.value)
    return false
  if (!account.value || !accountInfoFetched.value)
    return false
  if (accountAlwaysOn.value !== true)
    return false
  if (!pushSupported.value || !vapidKey.value)
    return false
  // Only prompt once we've actually checked the live subscription. Before that
  // the unknown state reads as "not subscribed" and would flash the banner.
  if (!pushResolved.value)
    return false
  if (pushSubscribed.value || dismissed.value)
    return false
  return true
})

async function handleEnable() {
  const ok = await subscribePush()
  if (ok)
    dismiss()
}
</script>

<template>
  <Flex v-if="visible" y-center x-between gap="s" class="push-banner" expand>
    <Flex y-center gap="s" class="push-banner__content">
      <Icon name="ph:bell-ringing" class="push-banner__icon text-color-accent" :size="18" />
      <span class="text-s">
        Enable <strong class="text-s">push notifications</strong> to get chat mentions delivered even when the app is closed.
      </span>
    </Flex>
    <Flex gap="xs" class="push-banner__actions">
      <Button variant="accent" size="s" :loading="pushLoading" @click="handleEnable">
        Enable
      </Button>
      <Button square size="s" variant="gray" aria-label="Dismiss" @click="dismiss">
        <Icon name="ph:x" />
      </Button>
    </Flex>
  </Flex>
</template>

<style lang="scss" scoped>
.push-banner {
  padding: var(--space-xs) var(--space-m);
  background: var(--color-bg-lowered);
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;

  &__content {
    min-width: 0;
  }

  &__icon {
    flex-shrink: 0;
  }

  &__actions {
    flex-shrink: 0;
  }
}
</style>
