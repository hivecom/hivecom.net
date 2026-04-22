<script setup lang="ts">
import { Button, Dropdown, DropdownItem, Flex, pushToast } from '@dolanske/vui'
import { useGameConnect } from '@/composables/useGameConnect'

interface Props {
  addresses: string[] | null | undefined
  port: string | null | undefined
  gameShorthand?: string | null
  variant?: 'accent' | 'gray' | 'success' | 'danger' | 'link'
  size?: 's' | 'm' | 'l'
  plain?: boolean
  outline?: boolean
  /** Passed through to the wrapper to stop click propagation (e.g. inside a NuxtLink) */
  stopPropagation?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  gameShorthand: null,
  variant: 'accent',
  size: 'm',
  plain: false,
  outline: false,
  stopPropagation: false,
})

const { getConnectActions, triggerConnect, supportsDirectConnect } = useGameConnect()

const connectActions = computed(() =>
  getConnectActions(props.addresses, props.port, props.gameShorthand),
)

const isSingleAddress = computed(() => connectActions.value.length === 1)
const singleAction = computed(() => connectActions.value[0] ?? null)
const isDirect = computed(() => supportsDirectConnect(props.gameShorthand))

const buttonLabel = computed(() => isDirect.value ? 'Launch & Connect' : 'Copy Address')
const buttonIcon = computed(() => isDirect.value ? 'ph:rocket-launch' : 'ph:copy')

function actionIcon(action: ReturnType<typeof getConnectActions>[number]) {
  return action.uri != null ? 'ph:rocket-launch' : 'ph:copy'
}

function handleClick(e: MouseEvent) {
  if (props.stopPropagation) {
    e.stopPropagation()
    e.preventDefault()
  }
  if (!singleAction.value)
    return
  if (singleAction.value.uri != null) {
    triggerConnect(singleAction.value)
    navigator.clipboard.writeText(singleAction.value.addressWithPort).catch(() => {})
    pushToast('Launching on Steam', { description: singleAction.value.addressWithPort, timeout: 3000 })
  }
  else {
    navigator.clipboard.writeText(singleAction.value.addressWithPort).catch(() => {})
    pushToast('Copied to clipboard', { description: singleAction.value.addressWithPort, timeout: 3000 })
  }
}

function handleToggle(e: MouseEvent, toggle: () => void) {
  if (props.stopPropagation) {
    e.stopPropagation()
    e.preventDefault()
  }
  toggle()
}

function handleActionClick(e: MouseEvent, action: ReturnType<typeof getConnectActions>[number]) {
  if (props.stopPropagation) {
    e.stopPropagation()
    e.preventDefault()
  }
  if (action.uri != null) {
    triggerConnect(action)
    navigator.clipboard.writeText(action.addressWithPort).catch(() => {})
    pushToast('Launching on Steam', { description: action.addressWithPort, timeout: 3000 })
  }
  else {
    navigator.clipboard.writeText(action.addressWithPort).catch(() => {})
    pushToast('Copied to clipboard', { description: action.addressWithPort, timeout: 3000 })
  }
}
</script>

<template>
  <div
    v-if="connectActions.length > 0"
    class="gameserver-connect-button"
    :data-dropdown-ignore="stopPropagation || undefined"
    @click.stop="stopPropagation ? () => {} : undefined"
  >
    <!-- Single address -->
    <Button
      v-if="isSingleAddress"
      :variant="variant"
      :size="size"
      :plain="plain"
      :outline="outline"
      @click="handleClick"
    >
      <template #start>
        <Icon :name="buttonIcon" />
      </template>
      {{ buttonLabel }}
    </Button>

    <!-- Multiple addresses -->
    <Dropdown v-else>
      <template #trigger="{ toggle }">
        <Button
          :variant="variant"
          :size="size"
          :plain="plain"
          :outline="outline"
          @click="(e: MouseEvent) => handleToggle(e, toggle)"
        >
          <template #start>
            <Icon :name="buttonIcon" />
          </template>
          <Flex y-center gap="xs">
            {{ buttonLabel }}
            <Icon name="ph:caret-down" />
          </Flex>
        </Button>
      </template>

      <DropdownItem
        v-for="action in connectActions"
        :key="action.addressWithPort"
      >
        <button
          class="gameserver-connect-button__item"
          @click="(e: MouseEvent) => handleActionClick(e, action)"
        >
          <Icon :name="actionIcon(action)" />
          {{ action.addressWithPort }}
        </button>
      </DropdownItem>
    </Dropdown>
  </div>
</template>

<style scoped lang="scss">
.gameserver-connect-button {
  display: inline-flex;

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
