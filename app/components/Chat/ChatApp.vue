<script setup lang="ts">
import { Button, Flex, Resizable, Spinner } from '@dolanske/vui'
import { useDataUser } from '@/composables/useDataUser'
import { useIrcChat } from '@/composables/useIrcChat'
import ChatComposer from './Composer.vue'
import ChatConnectForm from './ConnectForm.vue'
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

const { connState, isConnected, disconnect, ensureNick } = useIrcChat()

const fallbackNick = `anon-${Math.random().toString(36).slice(2, 7)}`
watch(user, u => ensureNick(u?.username ?? fallbackNick), { immediate: true })
</script>

<template>
  <section class="chat-app" :class="{ 'chat-app--compact': props.compact }">
    <header v-if="!props.compact" class="chat-app__bar">
      <ChatToolbar />
    </header>

    <Flex column y-stretch class="chat-app__body">
      <!-- Connecting -->
      <Flex v-if="connState === 'connecting'" y-center x-center gap="s" class="chat-app__status">
        <Spinner />
        <span>Connecting...</span>
      </Flex>

      <!-- Not connected: show connect form -->
      <Flex v-else-if="!isConnected" column y-center x-center class="chat-app__connect">
        <ChatConnectForm />
      </Flex>

      <!-- Connected: split layout (sidebar + chat) on the full page -->
      <Resizable
        v-else-if="!props.compact"
        :storage-key="LAYOUT_KEY"
        class="chat-app__layout"
      >
        <Flex y-stretch class="chat-app__sidebar">
          <ChatUserList />
        </Flex>
        <Flex column gap="s" class="chat-app__main">
          <ChatMessageLog />
          <ChatComposer />
        </Flex>
      </Resizable>

      <!-- Connected: stacked layout for the compact sheet -->
      <Flex v-else column gap="s" class="chat-app__main">
        <ChatMessageLog />
        <ChatComposer />
      </Flex>
    </Flex>

    <Flex v-if="isConnected" y-center x-between gap="s" class="chat-app__footer">
      <span class="chat-app__hint">Right-click a message for actions</span>
      <Button variant="danger" plain size="s" @click="disconnect">
        <template #icon>
          <Icon name="ph:plugs" />
        </template>
        Disconnect
      </Button>
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

  &__status,
  &__connect {
    flex: 1;
    min-height: 0;
  }

  &__connect {
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
    min-width: 140px;
    border-right: 1px solid var(--color-border);
  }

  &__main {
    flex: 1;
    min-height: 0;
    height: 100%;
    padding: var(--space-s) var(--space-m) var(--space-m);
  }

  &--compact &__main {
    padding: 0;
  }

  &__footer {
    padding: var(--space-xs) var(--space-m);
    border-top: 1px solid var(--color-border);
  }

  &--compact &__footer {
    padding: var(--space-s) 0 0;
    border-top: none;
  }

  &__hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
  }
}
</style>
