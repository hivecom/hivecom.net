<script setup lang="ts">
import { Divider, DropdownItem, pushToast } from '@dolanske/vui'
import { computed } from 'vue'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { useIrcChat } from '@/composables/useIrcChat'

/**
 * Shared fragment of user-targeted context menu items.
 * Renders: About/WHOIS, [#middle slot], Copy nickname, Message, Mention,
 * and optional mod actions (Op/Deop, Voice/Devoice, Kick, Ban, Kick & ban).
 *
 * - Emits `openWhois` with the nick; the parent is responsible for opening
 *   the WHOIS modal and closing the menu.
 * - Emits `close` after every other action so the parent can dismiss the menu.
 * - Self-targeted actions (Message, Mention, mod) are hidden when the nick
 *   matches the current user.
 */

const props = defineProps<{
  nick: string
  /** IRC prefix string (e.g. "@+") for the targeted user; used for Op/Voice checks. */
  prefix?: string
  /** When true, mod actions (Op/Deop/Voice/Devoice/Kick/Ban) are rendered
   *  for users with sufficient channel privileges. */
  showModActions?: boolean
}>()

const emit = defineEmits<{
  /** Parent should open the WHOIS modal for this nick and close the menu. */
  openWhois: [nick: string]
  /** Parent should close the context menu / sheet. */
  close: []
}>()

const { nick: currentNick, openPm, send, activeName, inputMessage, myChannelRole } = useIrcChat()
const { settings } = useDataUserSettings()

const isSelf = computed(() => props.nick === currentNick.value)

const MOD_SYMBOLS = new Set(['~', '&', '@'])
const canModerate = computed(() => {
  const ch = activeName.value
  if (!ch)
    return false
  const r = myChannelRole(ch)
  return r !== null && MOD_SYMBOLS.has(r.symbol)
})

const hasOp = computed(() => props.prefix?.includes('@') ?? false)
const hasVoice = computed(() => props.prefix?.includes('+') ?? false)

function doOpenWhois() {
  // Parent's openWhois handler is responsible for closing the menu.
  emit('openWhois', props.nick)
}

async function copyNick() {
  try {
    await navigator.clipboard.writeText(props.nick)
    pushToast('Nickname copied')
  }
  catch {
    pushToast('Could not copy to clipboard')
  }
  emit('close')
}

function doOpenPm() {
  openPm(props.nick)
  emit('close')
}

function doMention() {
  const current = inputMessage.value.trim()
  inputMessage.value = current ? `${current} @${props.nick} ` : `@${props.nick}: `
  emit('close')
}

function doOp() {
  const ch = activeName.value
  if (ch)
    send(`MODE ${ch} +o ${props.nick}`)
  emit('close')
}

function doDeop() {
  const ch = activeName.value
  if (ch)
    send(`MODE ${ch} -o ${props.nick}`)
  emit('close')
}

function doVoice() {
  const ch = activeName.value
  if (ch)
    send(`MODE ${ch} +v ${props.nick}`)
  emit('close')
}

function doDevoice() {
  const ch = activeName.value
  if (ch)
    send(`MODE ${ch} -v ${props.nick}`)
  emit('close')
}

function doKick() {
  const ch = activeName.value
  if (ch)
    send(`KICK ${ch} ${props.nick}`)
  emit('close')
}

function doBan() {
  const ch = activeName.value
  if (ch)
    send(`MODE ${ch} +b ${props.nick}!*@*`)
  emit('close')
}

function doKickBan() {
  const ch = activeName.value
  if (ch) {
    send(`MODE ${ch} +b ${props.nick}!*@*`)
    send(`KICK ${ch} ${props.nick}`)
  }
  emit('close')
}
</script>

<template>
  <DropdownItem @click="doOpenWhois">
    <template #icon>
      <Icon name="ph:info" />
    </template>
    <template v-if="settings.chat_irc_native_modes">
      WHOIS
    </template>
    <template v-else>
      About
    </template>
  </DropdownItem>
  <Divider />

  <!-- Slot for caller-specific items between the divider and the nick actions -->
  <slot name="middle" />

  <DropdownItem @click="copyNick">
    <template #icon>
      <Icon name="ph:user" />
    </template>
    Copy nickname
  </DropdownItem>

  <template v-if="!isSelf">
    <DropdownItem @click="doOpenPm">
      <template #icon>
        <Icon name="ph:chat-teardrop" />
      </template>
      Message {{ nick }}
    </DropdownItem>
    <DropdownItem @click="doMention">
      <template #icon>
        <Icon name="ph:at" />
      </template>
      Mention {{ nick }}
    </DropdownItem>

    <template v-if="showModActions && canModerate">
      <Divider />
      <DropdownItem v-if="!hasOp" @click="doOp">
        <template #icon>
          <Icon name="ph:shield-check" />
        </template>
        <template v-if="settings.chat_irc_native_modes">
          MODE +o
        </template>
        <template v-else>
          Op
        </template>
      </DropdownItem>
      <DropdownItem v-if="hasOp" @click="doDeop">
        <template #icon>
          <Icon name="ph:shield-slash" />
        </template>
        <template v-if="settings.chat_irc_native_modes">
          MODE -o
        </template>
        <template v-else>
          Deop
        </template>
      </DropdownItem>
      <DropdownItem v-if="!hasVoice" @click="doVoice">
        <template #icon>
          <Icon name="ph:microphone" />
        </template>
        <template v-if="settings.chat_irc_native_modes">
          MODE +v
        </template>
        <template v-else>
          Voice
        </template>
      </DropdownItem>
      <DropdownItem v-if="hasVoice" @click="doDevoice">
        <template #icon>
          <Icon name="ph:microphone-slash" />
        </template>
        <template v-if="settings.chat_irc_native_modes">
          MODE -v
        </template>
        <template v-else>
          Devoice
        </template>
      </DropdownItem>
      <Divider />
      <DropdownItem @click="doKick">
        <template #icon>
          <Icon name="ph:boot" class="text-color-yellow" />
        </template>
        <template v-if="settings.chat_irc_native_modes">
          KICK
        </template>
        <template v-else>
          Kick
        </template>
      </DropdownItem>
      <DropdownItem @click="doBan">
        <template #icon>
          <Icon name="ph:prohibit" class="text-color-red" />
        </template>
        <template v-if="settings.chat_irc_native_modes">
          MODE +b
        </template>
        <template v-else>
          Ban
        </template>
      </DropdownItem>
      <DropdownItem @click="doKickBan">
        <template #icon>
          <Icon name="ph:prohibit" class="text-color-red" />
        </template>
        <template v-if="settings.chat_irc_native_modes">
          KICK + MODE +b
        </template>
        <template v-else>
          Kick &amp; ban
        </template>
      </DropdownItem>
    </template>
  </template>
</template>
