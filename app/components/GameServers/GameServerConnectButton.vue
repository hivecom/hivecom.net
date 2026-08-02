<script setup lang="ts">
import type { ConnectAction, ConnectContext } from '@/composables/useGameConnect'
import { Button, Dropdown, DropdownItem, DropdownTitle, pushToast } from '@dolanske/vui'
import { useGameConnect } from '@/composables/useGameConnect'

interface Props {
  addresses: string[] | null | undefined
  port: string | null | undefined
  /** Resolved connect templates, from buildConnectContext(game, gameserver) */
  connect: ConnectContext
  variant?: 'accent' | 'gray' | 'success' | 'danger' | 'link'
  size?: 's' | 'm' | 'l'
  plain?: boolean
  outline?: boolean
  /** Passed through to the wrapper to stop click propagation (e.g. inside a NuxtLink) */
  stopPropagation?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'accent',
  size: 'm',
  plain: false,
  outline: false,
  stopPropagation: false,
})

interface MenuEntry {
  key: string
  label: string
  icon: string
  run: () => void
}

const { getConnectActions, triggerConnect } = useGameConnect()

const connectActions = computed(() =>
  getConnectActions(props.addresses, props.port, props.connect),
)

function copy(text: string) {
  navigator.clipboard.writeText(text).catch(() => {})
}

// Launching also copies the address, so there is a paste-ready fallback when
// the handler does not fire (game not installed, protocol blocked).
function launch(action: ConnectAction) {
  triggerConnect(action)
  copy(action.addressWithPort)
  pushToast('Launching on Steam', { description: action.addressWithPort, timeout: 3000 })
}

function copyAddress(action: ConnectAction) {
  copy(action.addressWithPort)
  pushToast('Copied to clipboard', { description: action.addressWithPort, timeout: 3000 })
}

function copyCommand(action: ConnectAction) {
  if (action.command == null)
    return
  copy(action.command)
  pushToast('Copied command', { description: action.command, timeout: 3000 })
}

function copyLauncherCommand(action: ConnectAction) {
  if (action.launcherCommand == null)
    return
  copy(action.launcherCommand)
  pushToast('Copied launcher command', { description: action.launcherCommand, timeout: 3000 })
}

interface MenuGroup {
  address: string
  items: MenuEntry[]
}

// Grouped by address rather than flattened, so the address is named once in a
// heading instead of repeated on every row. Keeps the labels short enough that
// the button does not crowd out the server name next to it.
const groups = computed<MenuGroup[]>(() =>
  connectActions.value.map((action) => {
    const items: MenuEntry[] = []

    if (action.uri != null) {
      items.push({
        key: `launch:${action.addressWithPort}`,
        label: 'Launch',
        icon: 'ph:rocket-launch',
        run: () => launch(action),
      })
    }

    items.push({
      key: `address:${action.addressWithPort}`,
      label: 'Copy Address',
      icon: 'ph:copy',
      run: () => copyAddress(action),
    })

    if (action.command != null) {
      items.push({
        key: `command:${action.addressWithPort}`,
        label: 'Copy Command',
        icon: 'ph:terminal-window',
        run: () => copyCommand(action),
      })
    }

    if (action.launcherCommand != null) {
      items.push({
        key: `launcher:${action.addressWithPort}`,
        label: 'Copy Launcher Command',
        icon: 'ph:terminal',
        run: () => copyLauncherCommand(action),
      })
    }

    return { address: action.addressWithPort, items }
  }),
)

const entries = computed(() => groups.value.flatMap(group => group.items))

// The primary action targets the first address. Aliases point at the same
// server, so picking one is fine, and the menu still names them all.
const primaryEntry = computed(() => entries.value[0] ?? null)
const hasMenu = computed(() => entries.value.length > 1)
const showGroupTitles = computed(() => groups.value.length > 1)

function withStop(e: MouseEvent, fn: () => void) {
  if (props.stopPropagation) {
    e.stopPropagation()
    e.preventDefault()
  }
  fn()
}

function runPrimary(e: MouseEvent) {
  withStop(e, () => primaryEntry.value?.run())
}
</script>

<template>
  <div
    v-if="primaryEntry"
    class="gameserver-connect-button"
    :class="{ 'gameserver-connect-button--split': hasMenu }"
    :data-dropdown-ignore="stopPropagation || undefined"
    @click.stop="stopPropagation ? () => {} : undefined"
  >
    <Button
      class="gameserver-connect-button__primary"
      :variant="variant"
      :size="size"
      :plain="plain"
      :outline="outline"
      @click="runPrimary"
    >
      <template #start>
        <Icon :name="primaryEntry.icon" />
      </template>
      {{ primaryEntry.label }}
    </Button>

    <Dropdown v-if="hasMenu">
      <template #trigger="{ toggle }">
        <Button
          class="gameserver-connect-button__caret"
          :variant="variant"
          :size="size"
          :plain="plain"
          :outline="outline"
          square
          aria-label="More connection options"
          @click="(e: MouseEvent) => withStop(e, toggle)"
        >
          <Icon name="ph:caret-down" />
        </Button>
      </template>

      <template v-for="group in groups" :key="group.address">
        <DropdownTitle v-if="showGroupTitles">
          {{ group.address }}
        </DropdownTitle>

        <DropdownItem v-for="entry in group.items" :key="entry.key">
          <button
            class="gameserver-connect-button__item"
            @click="(e: MouseEvent) => withStop(e, entry.run)"
          >
            <Icon :name="entry.icon" />
            {{ entry.label }}
          </button>
        </DropdownItem>
      </template>
    </Dropdown>
  </div>
</template>

<style scoped lang="scss">
.gameserver-connect-button {
  display: inline-flex;

  // Join the primary action and the menu caret into one control.
  &--split {
    .gameserver-connect-button__primary {
      border-top-right-radius: 0;
      border-bottom-right-radius: 0;
    }

    .gameserver-connect-button__caret {
      border-top-left-radius: 0;
      border-bottom-left-radius: 0;
      margin-left: 1px;
    }
  }

  &__item {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: var(--font-size-s);
    background: none;
    border: none;
    padding: 0;
    color: var(--color-text);
    cursor: pointer;
    width: 100%;
    text-align: left;
  }
}
</style>
