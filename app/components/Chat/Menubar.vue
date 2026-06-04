<script setup lang="ts">
import { Button, DropdownItem, DropdownTitle, Flex, Menubar, MenuItem, Sheet } from '@dolanske/vui'
import { computed, ref } from 'vue'
import { useIrcChat } from '@/composables/useIrcChat'
import { useBreakpoint } from '@/lib/mediaQuery'
import ChatUserListModal from './UserListModal.vue'

defineProps<{
  // Compact surfaces (the navbar sheet) have no sidebar, so hide its toggle.
  compact?: boolean
}>()

const { isConnected, connState, connect, disconnect, clearMessages, sidebarHidden, toggleSidebar, channelBrowserOpen, latencyMs } = useIrcChat()

const isMobile = useBreakpoint('<s')

const connectionDrawerOpen = ref(false)
const usersModalOpen = ref(false)

const latencyLabel = computed(() => {
  if (latencyMs.value == null)
    return null
  return `${latencyMs.value} ms`
})

function closeMenu() {
  if (import.meta.client) {
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }
}

function run(action: () => void) {
  action()
  setTimeout(closeMenu, 0)
}
</script>

<template>
  <!-- Mobile: sidebar icon + single merged Connection drawer -->
  <template v-if="isMobile">
    <Flex gap="xxs" class="chat-menubar">
      <Button size="s" plain @click="connectionDrawerOpen = true">
        Connection
      </Button>
    </Flex>

    <Sheet
      :open="connectionDrawerOpen"
      position="bottom"
      :card="{ separators: true,
               padding: false }"
      @close="connectionDrawerOpen = false"
    >
      <template #header>
        <h4 class="p-s">
          Connection
        </h4>
      </template>
      <div class="vui-dropdown chat-menubar__merged">
        <DropdownItem v-if="!isConnected" :disabled="connState === 'connecting'" @click="() => { connect(); connectionDrawerOpen = false }">
          <template #icon>
            <Icon name="ph:plugs-connected" />
          </template>
          Connect
        </DropdownItem>
        <DropdownItem v-if="isConnected" @click="() => { disconnect(); connectionDrawerOpen = false }">
          <template #icon>
            <Icon name="ph:plugs" />
          </template>
          Disconnect
        </DropdownItem>
        <DropdownItem @click="() => { clearMessages(); connectionDrawerOpen = false }">
          <template #icon>
            <Icon name="ph:trash" />
          </template>
          Clear log
        </DropdownItem>

        <template v-if="isConnected">
          <DropdownTitle>View</DropdownTitle>
          <DropdownItem @click="() => { channelBrowserOpen = true; connectionDrawerOpen = false }">
            <template #icon>
              <Icon name="ph:compass" />
            </template>
            Browse channels
          </DropdownItem>
          <DropdownItem @click="() => { usersModalOpen = true; connectionDrawerOpen = false }">
            <template #icon>
              <Icon name="ph:users" />
            </template>
            Users
          </DropdownItem>
        </template>

        <DropdownTitle>About</DropdownTitle>
        <p class="chat-menubar__server">
          irc.hivecom.net:6697
        </p>
        <template v-if="connState === 'connected' && latencyLabel">
          <DropdownTitle>Latency</DropdownTitle>
          <p class="chat-menubar__server chat-menubar__latency">
            {{ latencyLabel }}
          </p>
        </template>
      </div>
    </Sheet>
  </template>

  <!-- Desktop: sidebar icon button + single merged Connection dropdown -->
  <Flex v-else y-center :gap="0" class="chat-menubar">
    <Button
      v-if="!compact"
      square
      plain
      :aria-label="sidebarHidden ? 'Show sidebar' : 'Hide sidebar'"
      class="vui-button-accent-weak vui-button-rounded"
      @click="run(toggleSidebar)"
    >
      <Icon :name="sidebarHidden ? 'ph:sidebar-simple' : 'ph:sidebar'" size="16" />
    </Button>
    <Menubar>
      <MenuItem>
        <Button size="s" plain>
          Connection
        </Button>
        <template #menu>
          <div class="vui-dropdown chat-menubar__merged">
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
            <DropdownItem @click="run(clearMessages)">
              <template #icon>
                <Icon name="ph:trash" />
              </template>
              Clear log
            </DropdownItem>

            <template v-if="isConnected">
              <DropdownTitle>View</DropdownTitle>
              <DropdownItem @click="run(() => channelBrowserOpen = true)">
                <template #icon>
                  <Icon name="ph:compass" />
                </template>
                Browse channels
              </DropdownItem>
              <DropdownItem @click="run(() => usersModalOpen = true)">
                <template #icon>
                  <Icon name="ph:users" />
                </template>
                Users
              </DropdownItem>
            </template>

            <DropdownTitle>About</DropdownTitle>
            <p class="chat-menubar__server">
              irc.hivecom.net:6697
            </p>
            <template v-if="connState === 'connected' && latencyLabel">
              <DropdownTitle>Latency</DropdownTitle>
              <p class="chat-menubar__server chat-menubar__latency">
                {{ latencyLabel }}
              </p>
            </template>
          </div>
        </template>
      </MenuItem>
    </Menubar>
  </Flex>

  <ChatUserListModal :open="usersModalOpen" @close="usersModalOpen = false" />
</template>

<style lang="scss" scoped>
.chat-menubar {
  &__merged {
    min-width: 220px;
  }

  &__server {
    padding: var(--space-xs) var(--space-s);
    font-family: monospace;
    font-size: var(--font-size-s);
    color: var(--color-text-light);
  }

  &__latency {
    font-variant-numeric: tabular-nums;
  }
}
</style>
