<script setup lang="ts">
import { Flex, Modal, Tooltip } from '@dolanske/vui'
import { computed, watch } from 'vue'
import IrcWhoisCard from '@/components/Chat/IrcWhoisCard.vue'
import UserPreviewCard from '@/components/Shared/UserPreviewCard.vue'
import { SERVICE_NICKS, useIrcChat, whoisStore } from '@/composables/useIrcChat'
import { useIrcNickResolver } from '@/composables/useIrcNickResolver'
import { bridgeInfo } from '@/lib/chat/bridgeInfo'

const props = defineProps<{
  nick: string | null
  open: boolean
  /**
   * When set, this nick is a relaymsg spoofed nick. relayedBy is the actual
   * IRC bot nick that sent the RELAYMSG - the real user to WHOIS.
   */
  relayedBy?: string | null
}>()

const emit = defineEmits<{
  close: []
}>()

const { requestWhois, buffers, relaySeparator } = useIrcChat()
const { resolved, resolve } = useIrcNickResolver()

/** The display name - just the user part of the spoofed nick for relay messages. */
const displayNick = computed(() => {
  if (!props.nick)
    return null
  if (relaySeparator.value) {
    const idx = props.nick.indexOf(relaySeparator.value)
    if (idx > 0)
      return props.nick.slice(0, idx)
  }
  return props.nick
})

/** The bridge source name from the spoofed nick suffix (e.g. "tele" from "r4pid/tele"). */
const bridgeName = computed(() => {
  if (!props.nick || !relaySeparator.value)
    return null
  const idx = props.nick.indexOf(relaySeparator.value)
  if (idx <= 0)
    return null
  return props.nick.slice(idx + relaySeparator.value.length)
})

/**
 * The IRC nick to actually WHOIS.
 * For relay messages where relayedBy is set: that's the real bot to query.
 * Otherwise: the nick as-is.
 */
const whoisNick = computed(() => props.relayedBy ?? props.nick)

watch(() => [props.open, props.nick] as [boolean, string | null], ([open]) => {
  if (open && whoisNick.value) {
    requestWhois(whoisNick.value)
    resolve([whoisNick.value.toLowerCase()])
  }
}, { immediate: true })

const userId = computed(() => {
  if (!whoisNick.value)
    return null
  return resolved.value.get(whoisNick.value.toLowerCase())?.id ?? null
})

const whois = computed(() => {
  if (!whoisNick.value)
    return null
  return whoisStore.value.get(whoisNick.value.toLowerCase()) ?? null
})

const isService = computed(() => {
  if (!whoisNick.value)
    return false
  return SERVICE_NICKS.has(whoisNick.value.toLowerCase())
})

const isBot = computed(() => {
  if (!whoisNick.value)
    return false
  const nameLower = whoisNick.value.toLowerCase()
  return buffers.value.some(b => b.users?.some(u => u.name.toLowerCase() === nameLower && u.bot))
})
</script>

<template>
  <Modal v-if="nick" :open="open" size="s" @close="emit('close')">
    <template #header>
      <Flex y-center gap="xs">
        <h4 style="margin:0">
          {{ displayNick }}
        </h4>
        <Tooltip v-if="bridgeName">
          <Icon :name="bridgeInfo(bridgeName).icon" :size="16" class="text-color-lighter" />
          <template #tooltip>
            <p>Bridged from {{ bridgeInfo(bridgeName).label }}{{ relayedBy ? ` by ${relayedBy}` : '' }}</p>
          </template>
        </Tooltip>
      </Flex>
    </template>
    <Flex column :gap="0">
      <UserPreviewCard v-if="userId" :user-id="userId" class="irc-whois-modal__preview" />
      <IrcWhoisCard v-if="whois" :whois="whois" :standalone="!userId" :irc-only="!userId" :is-service="isService" :is-bot="isBot" />
    </Flex>
  </Modal>
</template>

<style lang="scss" scoped>
.irc-whois-modal {
  &__preview {
    width: 100%;
    max-width: 100%;
    padding: 0;
  }
}
</style>
