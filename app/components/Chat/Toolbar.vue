<script setup lang="ts">
import { Button, Flex, Indicator, Tooltip } from '@dolanske/vui'
import { computed, ref } from 'vue'
import { useIrcChat } from '@/composables/useIrcChat'
import { useUserId } from '@/composables/useUserId'
import { useBreakpoint } from '@/lib/mediaQuery'
import ChatIdentityModal from './IdentityModal.vue'
import ChatMenubar from './Menubar.vue'
import ChatSettingsModal from './SettingsModal.vue'
import ChatStateBadge from './StateBadge.vue'

defineProps<{
  // Shows the "expand to full page" link (used inside the navbar sheet).
  expandable?: boolean
  // Compact surfaces drop sidebar controls from the menubar.
  compact?: boolean
}>()

const emit = defineEmits<{ collapse: [] }>()

const isMobile = useBreakpoint('<s')

const settingsOpen = ref(false)
const identityOpen = ref(false)

const { isConnected, account, accountEmail, accountAlwaysOn } = useIrcChat()

const userId = useUserId()

// Show indicator when connected and either: email unclaimed or always-on explicitly disabled at user level.
const identityHasIssues = computed(() => {
  if (!isConnected.value || !account.value)
    return false
  if (accountEmail.value === null || accountAlwaysOn.value === null)
    return false
  const unclaimed = accountEmail.value === ''
  const notAlwaysOn = accountAlwaysOn.value === false
  return unclaimed || notAlwaysOn
})
</script>

<template>
  <Flex y-center x-between expand gap="s" class="chat-toolbar">
    <Flex y-center gap="s">
      <ChatMenubar :compact="compact" />
    </Flex>
    <Flex y-center gap="s">
      <ChatStateBadge v-if="!isMobile" />
      <Tooltip v-if="userId && account" :disabled="isMobile">
        <div class="chat-toolbar__identity-btn">
          <Button square plain aria-label="Identity" class="vui-button-accent-weak vui-button-rounded" @click="identityOpen = true">
            <Icon name="ph:identification-card" size="18" />
          </Button>
          <Indicator v-if="identityHasIssues" variant="away" position="top-right" size="s" outline />
        </div>
        <template #tooltip>
          <p>Identity</p>
        </template>
      </Tooltip>
      <Tooltip :disabled="isMobile">
        <Button square plain aria-label="Chat settings" class="vui-button-accent-weak vui-button-rounded" @click="settingsOpen = true">
          <Icon name="ph:gear-six" size="18" />
        </Button>
        <template #tooltip>
          <p>Chat settings</p>
        </template>
      </Tooltip>
      <Tooltip v-if="expandable" :disabled="isMobile">
        <NuxtLink to="/chat" @click="emit('collapse')">
          <Button square plain aria-label="Expand chat" class="vui-button-accent-weak vui-button-rounded">
            <Icon name="ph:arrows-out" size="18" />
          </Button>
        </NuxtLink>
        <template #tooltip>
          <p>Open full chat</p>
        </template>
      </Tooltip>
    </Flex>
  </Flex>

  <ChatIdentityModal :open="identityOpen" @close="identityOpen = false" />
  <ChatSettingsModal :open="settingsOpen" @close="settingsOpen = false" />
</template>

<style lang="scss" scoped>
.chat-toolbar {
  &__identity-btn {
    position: relative;
    display: inline-flex;
  }
}
</style>
