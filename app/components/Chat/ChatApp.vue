<script setup lang="ts">
import { Button, Flex, Resizable } from '@dolanske/vui'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import SharedErrorAlert from '@/components/Shared/ErrorAlert.vue'
import { useDataUser } from '@/composables/useDataUser'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { useIrcChat } from '@/composables/useIrcChat'
import { useBreakpoint } from '@/lib/mediaQuery'
import ChatChannelJoinBlockedModal from './ChannelJoinBlockedModal.vue'
import ChatChannelList from './ChannelList.vue'
import ChatChannelPasswordModal from './ChannelPasswordModal.vue'
import ChatChannelSettingsModal from './ChannelSettingsModal.vue'
import ChatChannelHeader from './ChatHeader.vue'
import ChatComposer from './Composer.vue'
import ChatConnectForm from './ConnectForm.vue'
import ChatConnecting from './Connecting.vue'
import ChatMessageLog from './MessageLog.vue'
import ChatNoChannels from './NoChannels.vue'
import ChatSidebarSplit from './SidebarSplit.vue'
import ChatToolbar from './Toolbar.vue'
import ChatUserList from './UserList.vue'

const props = defineProps<{
  // Compact surfaces (the navbar sheet) drop the sidebar and their own header,
  // since the surrounding sheet provides the header chrome instead.
  compact?: boolean
  // When true, signals that the surrounding menu/sheet removed card padding and
  // the associated header should receive padding-x: space-s to compensate.
  menuPadding?: boolean
}>()

const LAYOUT_KEY = 'hivecom.chat.layout'
const SIDEBAR_KEY = 'hivecom.chat.sidebar'

// Seed a sensible initial split (narrow sidebar) before Resizable mounts.
if (import.meta.client && !localStorage.getItem(LAYOUT_KEY)) {
  localStorage.setItem(
    LAYOUT_KEY,
    JSON.stringify([{ size: 24, isResizing: false }, { size: 76, isResizing: false }]),
  )
}

const userId = useUserId()
const { user } = useDataUser(userId)
const { settings } = useDataUserSettings()

const isMobile = useBreakpoint('<s')

const { connState, isConnected, ensureNick, clearAuthedIdentity, activeBuffer, sidebarHidden, buffers, connect, disconnect, channelKeyPrompt, channelSettingsOpen, channelJoinBlocked, serverLogPinned } = useIrcChat()

// Auto-reconnect when the browser comes back from sleep or phone background.
// Track whether a connection was ever established so we only auto-reconnect
// after an unexpected drop, not after the user intentionally clicked "Go back".
const hadConnection = ref(false)
watch(isConnected, (connected) => {
  if (connected)
    hadConnection.value = true
})

function handleDisconnect() {
  hadConnection.value = false
  disconnect()
}

function tryReconnect() {
  if (document.visibilityState !== 'visible')
    return
  if (!hadConnection.value)
    return
  if (connState.value === 'connecting' || connState.value === 'connected')
    return
  connect()
}

onMounted(() => {
  document.addEventListener('visibilitychange', tryReconnect)
  window.addEventListener('online', tryReconnect)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', tryReconnect)
  window.removeEventListener('online', tryReconnect)
})

const isCompactLayout = computed(() => props.compact || isMobile.value || sidebarHidden.value)

const lastConnError = computed(() => {
  const serverBuf = buffers.value.find(b => b.kind === 'server')
  return [...(serverBuf?.messages ?? [])].reverse().find(m => m.type === 'error')?.text ?? ''
})

const isChannelBuffer = computed(() => activeBuffer.value?.kind === 'channel')
const hasChannels = computed(() => buffers.value.some(b => b.kind === 'channel'))
const chatFontStyle = computed(() => ({ '--chat-font-size': `${isMobile.value ? settings.value.chat_mobile_font_size : settings.value.chat_font_size}px` }))

const fallbackNick = `anon-${Math.random().toString(36).slice(2, 7)}`
watch(user, (u, prev) => {
  if (!u) {
    // Signed out (either a live sign-out, or loaded without a session). Drop any
    // persisted identity from a previous signed-in session so the connect form
    // doesn't pre-fill that registered nick/channel - it would fail to auth.
    if (prev && isConnected.value)
      disconnect()
    clearAuthedIdentity()
    ensureNick(fallbackNick)
    return
  }
  ensureNick(u.username ?? fallbackNick)
}, { immediate: true })
</script>

<template>
  <section
    class="chat-app" :class="{ 'chat-app--compact': props.compact || isMobile,
                               'chat-app--menu-padding': props.menuPadding }" :style="chatFontStyle"
  >
    <!-- On the mobile dedicated page the toolbar moves into the nav sheet
         (ChatNavSheet), so the page chrome stays minimal. -->
    <header v-if="!props.compact && !isMobile" class="chat-app__bar">
      <ChatToolbar />
    </header>

    <Flex column y-stretch class="chat-app__body">
      <Transition name="chat-state" mode="out-in">
        <!-- Connecting -->
        <div v-if="connState === 'connecting'" class="chat-app__status">
          <ChatConnecting />
        </div>

        <!-- Offline: failed all reconnect attempts -->
        <div v-else-if="connState === 'offline'" class="chat-app__status">
          <ChatConnecting offline @retry="connect()" @go-back="handleDisconnect" />
        </div>

        <!-- Error: unexpected connection failure (fallback) -->
        <Flex v-else-if="connState === 'error'" key="error" y-center x-center class="chat-app__connect">
          <Flex column gap="m" expand>
            <SharedErrorAlert standalone message="Failed to connect to the chat server." :error="lastConnError" />
            <Flex x-center gap="s">
              <Button variant="gray" @click="handleDisconnect()">
                <template #start>
                  <Icon name="ph:arrow-left" />
                </template>
                Go back
              </Button>
              <Button variant="accent" @click="connect()">
                <template #start>
                  <Icon name="ph:arrows-clockwise" />
                </template>
                Retry
              </Button>
            </Flex>
          </Flex>
        </Flex>

        <!-- Not connected: show connect form centered -->
        <Flex v-else-if="!isConnected" key="disconnected" y-center x-center class="chat-app__connect">
          <ChatConnectForm />
        </Flex>

        <!-- Connected: split layout (sidebar + chat) on the full page -->
        <Resizable
          v-else-if="!isCompactLayout && !sidebarHidden"
          key="connected-full"
          :storage-key="LAYOUT_KEY"
          class="chat-app__layout"
        >
          <Flex column y-stretch class="chat-app__sidebar" expand>
            <ChatSidebarSplit v-if="isChannelBuffer" :storage-key="SIDEBAR_KEY" class="chat-app__sidebar-split">
              <template #top>
                <ChatChannelList />
              </template>
              <template #bottom>
                <ChatUserList />
              </template>
            </ChatSidebarSplit>
            <Flex v-else column y-stretch expand class="chat-app__channels">
              <ChatChannelList />
            </Flex>
          </Flex>
          <Flex column :gap="0" class="chat-app__main">
            <ChatChannelHeader />
            <ChatNoChannels v-if="!hasChannels && !serverLogPinned" />
            <ChatMessageLog v-else :compact="props.compact" />
            <ChatComposer v-if="hasChannels || serverLogPinned" />
          </Flex>
        </Resizable>

        <!-- Connected: full page, sidebar hidden -->
        <Flex v-else-if="!isCompactLayout" key="connected-nosidebar" column :gap="0" class="chat-app__main">
          <ChatChannelHeader />
          <ChatNoChannels v-if="!hasChannels && !serverLogPinned" />
          <ChatMessageLog v-else :compact="props.compact" />
          <ChatComposer v-if="hasChannels || serverLogPinned" />
        </Flex>

        <!-- Connected: mobile dedicated page. Channels/users/settings live in
             the nav sheet, so the page shows a compact header instead of the
             in-page channel strip to reclaim vertical space. -->
        <Flex v-else-if="isMobile && !props.compact" key="connected-mobile-page" column :gap="0" class="chat-app__main">
          <ChatChannelHeader compact />
          <ChatNoChannels v-if="!hasChannels && !serverLogPinned" />
          <ChatMessageLog v-else :compact="props.compact" />
          <ChatComposer v-if="hasChannels || serverLogPinned" compact />
        </Flex>

        <!-- Connected: stacked layout for the compact navbar sheet -->
        <Flex v-else key="connected-compact" column :gap="0" class="chat-app__main">
          <ChatChannelList horizontal />
          <ChatNoChannels v-if="!hasChannels && !serverLogPinned" />
          <ChatMessageLog v-else :compact="props.compact" />
          <ChatComposer v-if="hasChannels || serverLogPinned" compact />
        </Flex>
      </Transition>
    </Flex>

    <ChatChannelPasswordModal :channel="channelKeyPrompt" @close="channelKeyPrompt = null" />
    <ChatChannelSettingsModal :channel="channelSettingsOpen" @close="channelSettingsOpen = null" />
    <ChatChannelJoinBlockedModal :blocked="channelJoinBlocked" @close="channelJoinBlocked = null" />
  </section>
</template>

<style lang="scss" scoped>
.chat-app {
  display: flex;
  flex-direction: column;
  width: 100%;
  // Fill the parent via flex rather than height: 100%. Both surfaces (.chat-page
  // and the sheet's .vui-card-content) are flex columns; a percentage height
  // doesn't resolve against the sheet's flex-derived height, which let content
  // overflow the card-content (VUI makes it overflow-y: auto) instead of the
  // inner .chat-log__scroll - breaking scroll-to-load and autoscroll there.
  flex: 1;
  min-height: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-l);
  overflow: hidden;

  &--compact {
    border: none;
    border-radius: 0;
    background: transparent;
  }

  &__bar {
    padding: var(--space-s) var(--space-m);
    border-bottom: 1px solid var(--color-border);
  }

  &__body {
    flex: 1;
    min-height: 0;
  }

  &__status {
    position: relative;
    flex: 1;
    min-height: 0;
  }

  &__connect {
    flex: 1;
    min-height: 0;
    padding: var(--space-l);
    width: 100%;
    max-width: 480px;
    margin: 0 auto;
  }

  &__layout {
    flex: 1;
    min-height: 0;
  }

  &__sidebar {
    min-height: 0;
    height: 100%;
    min-width: 160px;
    border-right: 1px solid var(--color-border);
  }

  &__sidebar-split {
    flex: 1;
    min-height: 0;
  }

  &__channels {
    width: 100%;
    min-height: 0;
  }

  &__users {
    min-height: 0;
  }

  &__main {
    flex: 1;
    min-height: 0;
    height: 100%;
  }

  .chat-state-enter-active,
  .chat-state-leave-active {
    transition: opacity var(--transition);
  }

  .chat-state-enter-from,
  .chat-state-leave-to {
    opacity: 0;
  }

  &--compact &__main {
    padding: 0;
  }
}
</style>
