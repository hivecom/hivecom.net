<script setup lang="ts">
import { Button, DropdownItem, DropdownTitle, Flex, Menubar, MenuItem, Sheet, Tooltip } from '@dolanske/vui'
import { computed, ref } from 'vue'
import { useIrcChat } from '@/composables/useIrcChat'
import { useBreakpoint } from '@/lib/mediaQuery'

defineProps<{
  // Compact surfaces (the navbar sheet) have no sidebar, so hide its toggle.
  compact?: boolean
}>()

const router = useRouter()

// Desktop chat is full-screen with no global navbar, so give it a way out: back
// to wherever the user came from, or home if they landed here directly.
function goBack() {
  const prev = window.history.state?.back as string | undefined
  if (prev)
    router.back()
  else
    navigateTo('/')
}

const { isConnected, connState, connect, disconnect, sidebarHidden, toggleSidebar, latencyMs, activeName, activateServerLog } = useIrcChat()

const isMobile = useBreakpoint('<s')

const connectionDrawerOpen = ref(false)

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
        <DropdownItem v-if="isConnected" :class="{ 'vui-dropdown-item--active': activeName === '*' }" @click="() => { activateServerLog(); connectionDrawerOpen = false }">
          <template #icon>
            <Icon name="ph:hard-drives" />
          </template>
          Server log
        </DropdownItem>
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

  <!-- Desktop: back arrow + Connection + View menus -->
  <Flex v-else y-center :gap="0" class="chat-menubar">
    <Tooltip v-if="!compact">
      <Button size="s" square plain aria-label="Back" @click="goBack">
        <Icon name="ph:arrow-left" />
      </Button>
      <template #tooltip>
        <p>Back</p>
      </template>
    </Tooltip>
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
            <DropdownItem v-if="isConnected" :class="{ 'vui-dropdown-item--active': activeName === '*' }" @click="run(activateServerLog)">
              <template #icon>
                <Icon name="ph:hard-drives" />
              </template>
              Server log
            </DropdownItem>
            <DropdownTitle>About</DropdownTitle>
            <p class="chat-menubar__server">
              irc.hivecom.net:6697
            </p>
          </div>
        </template>
      </MenuItem>
      <MenuItem v-if="!compact">
        <Button size="s" plain>
          View
        </Button>
        <template #menu>
          <div class="vui-dropdown chat-menubar__merged">
            <DropdownItem @click="run(toggleSidebar)">
              <template #icon>
                <Icon :name="sidebarHidden ? 'ph:sidebar-simple' : 'ph:sidebar'" />
              </template>
              {{ sidebarHidden ? 'Show sidebar' : 'Hide sidebar' }}
            </DropdownItem>
          </div>
        </template>
      </MenuItem>
    </Menubar>
  </Flex>
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
