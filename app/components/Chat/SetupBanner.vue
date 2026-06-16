<script setup lang="ts">
import { Button, Flex } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import { useIrcChat } from '@/composables/useIrcChat'

const emit = defineEmits<{ openIdentity: [] }>()

const DISMISSED_KEY = 'hivecom.chat.setup-dismissed'

const { account, accountAlwaysOn, accountEmail, accountInfoFetched, enableAlwaysOn } = useIrcChat()

const dismissed = ref(false)

// Key dismissal per account so switching accounts can re-prompt.
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

// Reload dismissal state when the account changes.
watch(account, () => loadDismissed(), { immediate: true })

const needsAlwaysOn = computed(() => accountInfoFetched.value && accountAlwaysOn.value === false)
const needsEmail = computed(() => accountInfoFetched.value && accountEmail.value === '')

const visible = computed(() => {
  if (!account.value || dismissed.value || !accountInfoFetched.value)
    return false
  return needsAlwaysOn.value || needsEmail.value
})

const enablingAlwaysOn = ref(false)
async function handleEnableAlwaysOn() {
  enablingAlwaysOn.value = true
  enableAlwaysOn()
  // The reactive accountAlwaysOn will update once the server confirms.
  // Add a safety timeout so the button doesn't stay loading forever.
  setTimeout(() => {
    enablingAlwaysOn.value = false
  }, 8000)
}

watch(accountAlwaysOn, (val) => {
  if (val === true)
    enablingAlwaysOn.value = false
})
</script>

<template>
  <Flex v-if="visible" y-center x-between gap="s" class="setup-banner" expand>
    <Flex y-center gap="s" class="setup-banner__content">
      <Icon name="ph:info" class="setup-banner__icon text-color-yellow" :size="18" />
      <span v-if="needsAlwaysOn" class="text-s">
        Enable <strong class="text-s">always-on</strong> to stay connected and receive messages while you're away.
      </span>
      <span v-else-if="needsEmail" class="text-s">
        Link your Hivecom account to your chat identity to keep them in sync.
      </span>
    </Flex>
    <Flex gap="xs" class="setup-banner__actions">
      <Button v-if="needsAlwaysOn" variant="accent" size="s" :loading="enablingAlwaysOn" @click="handleEnableAlwaysOn">
        Enable
      </Button>
      <Button v-else-if="needsEmail" variant="accent" size="s" @click="emit('openIdentity')">
        Set up
      </Button>
      <Button square size="s" variant="gray" aria-label="Dismiss" @click="dismiss">
        <Icon name="ph:x" />
      </Button>
    </Flex>
  </Flex>
</template>

<style lang="scss" scoped>
.setup-banner {
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
