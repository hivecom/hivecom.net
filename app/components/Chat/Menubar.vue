<script setup lang="ts">
import { Button, DropdownItem, DropdownTitle, Menubar, MenuItem } from '@dolanske/vui'
import { ref } from 'vue'
import { useIrcChat } from '@/composables/useIrcChat'
import ChatNickChangeModal from './NickChangeModal.vue'

defineProps<{
  // Compact surfaces (the navbar sheet) have no sidebar, so hide its toggle.
  compact?: boolean
}>()

const { WS_URL, isConnected, connState, connect, disconnect, clearMessages, sidebarHidden, toggleSidebar, account, channelBrowserOpen } = useIrcChat()

const nickChangeOpen = ref(false)

function closeMenu() {
  if (import.meta.client)
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
}

function run(action: () => void) {
  action()
  closeMenu()
}
</script>

<template>
  <Menubar class="chat-menubar">
    <MenuItem v-if="isConnected">
      <Button size="s" plain>
        Connection
      </Button>
      <template #menu>
        <div class="vui-dropdown">
          <DropdownItem v-if="!isConnected" :disabled="connState === 'connecting'" @click="run(connect)">
            <template #icon>
              <Icon name="ph:plugs-connected" />
            </template>
            Connect
          </DropdownItem>
          <DropdownItem v-if="isConnected" @click="run(disconnect)">
            <template #icon>
              <Icon name="ph:plugs" />
            </template>
            Disconnect
          </DropdownItem>
          <DropdownItem v-if="account && isConnected" @click="run(() => nickChangeOpen = true)">
            <template #icon>
              <Icon name="ph:identification-badge" />
            </template>
            Change nick
          </DropdownItem>
        </div>
      </template>
    </MenuItem>

    <MenuItem v-if="isConnected">
      <Button size="s" plain>
        View
      </Button>
      <template #menu>
        <div class="vui-dropdown">
          <DropdownItem @click="run(clearMessages)">
            <template #icon>
              <Icon name="ph:trash" />
            </template>
            Clear log
          </DropdownItem>
          <DropdownItem v-if="!compact" @click="run(toggleSidebar)">
            <template #icon>
              <Icon :name="sidebarHidden ? 'ph:sidebar-simple' : 'ph:sidebar'" />
            </template>
            {{ sidebarHidden ? 'Show sidebar' : 'Hide sidebar' }}
          </DropdownItem>
          <DropdownItem :disabled="!isConnected" @click="run(() => channelBrowserOpen = true)">
            <template #icon>
              <Icon name="ph:compass" />
            </template>
            Browse channels
          </DropdownItem>
        </div>
      </template>
    </MenuItem>

    <MenuItem>
      <Button size="s" plain>
        About
      </Button>
      <template #menu>
        <div class="vui-dropdown chat-menubar__about">
          <DropdownTitle>Server</DropdownTitle>
          <p class="chat-menubar__server">
            irc.hivecom.net:6697
          </p>
          <DropdownTitle>WebSocket</DropdownTitle>
          <p class="chat-menubar__server">
            {{ WS_URL }}
          </p>
        </div>
      </template>
    </MenuItem>
  </Menubar>

  <ChatNickChangeModal :open="nickChangeOpen" @close="nickChangeOpen = false" />
</template>

<style lang="scss" scoped>
.chat-menubar {
  &__about {
    min-width: 220px;
  }

  &__server {
    padding: var(--space-xs) var(--space-s);
    font-family: monospace;
    font-size: var(--font-size-s);
    color: var(--color-text-light);
  }
}
</style>
