<script setup lang="ts">
import { Button, Flex, Resizable } from '@dolanske/vui'
import { computed, watch } from 'vue'
import SharedErrorAlert from '@/components/Shared/ErrorAlert.vue'
import { useDataUser } from '@/composables/useDataUser'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { useIrcChat } from '@/composables/useIrcChat'
import { useBreakpoint } from '@/lib/mediaQuery'
import ChatChannelList from './ChannelList.vue'
import ChatComposer from './Composer.vue'
import ChatConnectForm from './ConnectForm.vue'
import ChatConnecting from './Connecting.vue'
import ChatMessageLog from './MessageLog.vue'
import ChatToolbar from './Toolbar.vue'
import ChatUserList from './UserList.vue'

const props = defineProps<{
  // Compact surfaces (the navbar sheet) drop the sidebar and their own header,
  // since the surrounding sheet provides the header chrome instead.
  compact?: boolean
}>()

const LAYOUT_KEY = 'hivecom.chat.layout'

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

const { connState, isConnected, ensureNick, clearInputNick, activeBuffer, sidebarHidden, buffers, connect, disconnect } = useIrcChat()

const isCompactLayout = computed(() => props.compact || isMobile.value || sidebarHidden.value)

const lastConnError = computed(() => {
  const serverBuf = buffers.value.find(b => b.kind === 'server')
  return [...(serverBuf?.messages ?? [])].reverse().find(m => m.type === 'error')?.text ?? ''
})

const isChannelBuffer = computed(() => activeBuffer.value?.kind === 'channel')
const chatFontStyle = computed(() => ({ '--chat-font-size': `${isMobile.value ? settings.value.chat_mobile_font_size : settings.value.chat_font_size}px` }))

const fallbackNick = `anon-${Math.random().toString(36).slice(2, 7)}`
watch(user, (u, prev) => {
  if (!u && prev) {
    // User signed out - disconnect and clear persisted nick
    if (isConnected.value)
      disconnect()
    clearInputNick()
    return
  }
  ensureNick(u?.username ?? fallbackNick)
}, { immediate: true })
</script>

<template>
  <section class="chat-app" :class="{ 'chat-app--compact': props.compact || isMobile }" :style="chatFontStyle">
    <header v-if="!props.compact" class="chat-app__bar">
      <ChatToolbar />
    </header>

    <Flex column y-stretch class="chat-app__body">
      <Transition name="chat-state" mode="out-in">
        <!-- Connecting -->
        <div v-if="connState === 'connecting'" class="chat-app__status">
          <ChatConnecting />
        </div>

        <!-- Error: connection failed -->
        <Flex v-else-if="connState === 'error'" key="error" y-center x-center class="chat-app__connect">
          <Flex column gap="m" expand>
            <SharedErrorAlert standalone message="Failed to connect to the chat server." :error="lastConnError" />
            <Flex x-center gap="s">
              <Button variant="gray" @click="disconnect()">
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
            <Flex class="chat-app__channels" :class="{ 'chat-app__channels--expanded': !isChannelBuffer }">
              <ChatChannelList />
            </Flex>
            <Flex v-if="isChannelBuffer" class="chat-app__users">
              <ChatUserList />
            </Flex>
          </Flex>
          <Flex column gap="s" class="chat-app__main">
            <ChatMessageLog :compact="isCompactLayout" />
            <ChatComposer />
          </Flex>
        </Resizable>

        <!-- Connected: full page, sidebar hidden -->
        <Flex v-else-if="!isCompactLayout" key="connected-nosidebar" column gap="s" class="chat-app__main">
          <ChatMessageLog :compact="isCompactLayout" />
          <ChatComposer />
        </Flex>

        <!-- Connected: stacked layout for the compact sheet -->
        <Flex v-else key="connected-compact" column gap="s" class="chat-app__main">
          <ChatChannelList horizontal />
          <ChatMessageLog :compact="isCompactLayout" />
          <ChatComposer />
        </Flex>
      </Transition>
    </Flex>
  </section>
</template>

<style lang="scss" scoped>
.chat-app {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
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

  &__channels {
    width: 100%;
    flex: 0 0 auto;
    max-height: 50%;
    min-height: 0;
    border-bottom: 1px solid var(--color-border);

    &--expanded {
      flex: 1;
      max-height: 100%;
      border-bottom: none;
    }
  }

  &__users {
    flex: 1;
    min-height: 0;
  }

  &__main {
    flex: 1;
    min-height: 0;
    height: 100%;
    padding: var(--space-s) var(--space-m) var(--space-m);
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
