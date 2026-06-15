<script setup lang="ts">
import { Button, Divider, Flex, Sheet, Tooltip } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import ChatChannelList from '@/components/Chat/ChannelList.vue'
import ChatIdentityModal from '@/components/Chat/IdentityModal.vue'
import ChatSettingsModal from '@/components/Chat/SettingsModal.vue'
import ChatStateBadge from '@/components/Chat/StateBadge.vue'
import ChatUserList from '@/components/Chat/UserList.vue'
import { useChatNavSheet } from '@/composables/useChatNavSheet'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { useIrcChat } from '@/composables/useIrcChat'
import { useUserId } from '@/composables/useUserId'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{
  // When true, render a plain (mobile) trigger instead of the tooltip button.
  mobile?: boolean
  // When true, suppress the trigger button entirely (the surrounding page
  // provides its own trigger, e.g. ChatHeader's back button on mobile).
  noTrigger?: boolean
}>()

const isMobile = useBreakpoint('<s')
const sheetSize = computed(() => isMobile.value ? '100%' : 360)

// Navigation drawer for the dedicated /chat page. Distinct from the global chat
// sheet (chatSheetOpen) since the page itself is the chat surface; this only
// surfaces channels, users, and the connection/identity/settings controls.
const { open } = useChatNavSheet()
const identityOpen = ref(false)
const settingsOpen = ref(false)

const { isConnected, connState, connect, disconnect, hasUnread, hasMention, activeBuffer } = useIrcChat()
const { settings } = useDataUserSettings()
const userId = useUserId()

const isChannelBuffer = computed(() => activeBuffer.value?.kind === 'channel')

const showBadge = computed(() => {
  if (open.value || !isConnected.value)
    return false
  return settings.value.chat_notify_only_mentions ? hasMention.value : hasUnread.value
})

const route = useRoute()
watch(() => route.fullPath, () => {
  open.value = false
})

// Picking a channel or user returns the user to the conversation.
watch(() => activeBuffer.value?.name, () => {
  if (open.value)
    open.value = false
})
</script>

<template>
  <div class="chat-nav-sheet">
    <Tooltip v-if="!props.noTrigger && !props.mobile">
      <Button
        square
        plain
        aria-label="Chat"
        class="vui-button-accent-weak vui-button-rounded"
        @click="open = true"
      >
        <Icon name="ph:chat-dots" size="20" />
        <span v-if="showBadge" class="chat-nav-sheet__badge" :class="{ 'chat-nav-sheet__badge--mention': hasMention }" />
      </Button>
      <template #tooltip>
        <p>Channels &amp; users</p>
      </template>
    </Tooltip>

    <Button
      v-else-if="!props.noTrigger"
      square
      plain
      aria-label="Chat"
      class="vui-button-accent-weak vui-button-rounded"
      @click="open = true"
    >
      <Icon name="ph:chat-dots" size="20" />
      <span v-if="showBadge" class="chat-nav-sheet__badge" :class="{ 'chat-nav-sheet__badge--mention': hasMention }" />
    </Button>

    <Sheet
      :open="open"
      position="left"
      :size="sheetSize"
      :card="{ separators: true,
               padding: false }"
      class="chat-nav-sheet__panel"
      @close="open = false"
    >
      <template #header>
        <Flex y-center x-between expand class="p-m">
          <h4>Chat</h4>
          <ChatStateBadge />
        </Flex>
      </template>

      <Flex column expand>
        <ChatChannelList input-top no-scroll />
        <template v-if="isChannelBuffer">
          <Divider />
          <ChatUserList :limit="10" />
        </template>
      </Flex>

      <template #footer>
        <Flex column gap="s" expand class="p-s">
          <Flex gap="s" expand>
            <Button expand variant="gray" @click="settingsOpen = true">
              <template #start>
                <Icon name="ph:gear-six" />
              </template>
              Settings
            </Button>
            <Button v-if="userId" expand variant="gray" @click="identityOpen = true">
              <template #start>
                <Icon name="ph:identification-card" />
              </template>
              Identity
            </Button>
          </Flex>
          <Button v-if="isConnected" expand variant="danger" @click="disconnect">
            <template #start>
              <Icon name="ph:plugs" />
            </template>
            Disconnect
          </Button>
          <Button v-else expand variant="accent" :disabled="connState === 'connecting'" @click="connect">
            <template #start>
              <Icon name="ph:plugs-connected" />
            </template>
            Connect
          </Button>
        </Flex>
      </template>
    </Sheet>

    <ChatIdentityModal :open="identityOpen" @close="identityOpen = false" />
    <ChatSettingsModal :open="settingsOpen" @close="settingsOpen = false" />
  </div>
</template>

<style lang="scss" scoped>
.chat-nav-sheet {
  position: relative;

  // Mirrors the chat sheet's trigger badge.
  &__badge {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 12px;
    height: 12px;
    border-radius: var(--border-radius-pill);
    background-color: var(--color-text-green);
    border: 2px solid var(--color-bg);
    pointer-events: none;

    &--mention {
      background-color: var(--color-text-red);
    }
  }
}
</style>

<style lang="scss">
// Sheet content is teleported, so this rule is intentionally global. The body
// scrolls natively (only when the lists overflow) between header and footer.
.vui-card.chat-nav-sheet__panel > .vui-card-header {
  padding-right: var(--space-m) !important;
}

.chat-nav-sheet__panel > .vui-card-content {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
}
</style>
