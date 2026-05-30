<script setup lang="ts">
import { Button, DropdownItem, DropdownTitle, Menubar, MenuItem } from '@dolanske/vui'
import { useIrcChat } from '@/composables/useIrcChat'

const { WS_URL, isConnected, connState, connect, disconnect, clearMessages } = useIrcChat()

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
    <MenuItem>
      <Button size="s" plain>
        Connection
      </Button>
      <template #menu>
        <div class="vui-dropdown">
          <DropdownItem :disabled="connState === 'connecting'" @click="run(connect)">
            <template #icon>
              <Icon :name="isConnected ? 'ph:arrows-clockwise' : 'ph:plugs-connected'" />
            </template>
            {{ isConnected ? 'Reconnect' : 'Connect' }}
          </DropdownItem>
          <DropdownItem :disabled="!isConnected" @click="run(disconnect)">
            <template #icon>
              <Icon name="ph:plugs" />
            </template>
            Disconnect
          </DropdownItem>
        </div>
      </template>
    </MenuItem>

    <MenuItem>
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
        </div>
      </template>
    </MenuItem>

    <MenuItem>
      <Button size="s" plain>
        Help
      </Button>
      <template #menu>
        <div class="vui-dropdown chat-menubar__help">
          <DropdownTitle>Server</DropdownTitle>
          <p class="chat-menubar__server">
            {{ WS_URL }}
          </p>
        </div>
      </template>
    </MenuItem>
  </Menubar>
</template>

<style lang="scss" scoped>
.chat-menubar {
  &__help {
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
