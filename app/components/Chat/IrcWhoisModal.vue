<script setup lang="ts">
import { Flex, Modal } from '@dolanske/vui'
import { computed, watch } from 'vue'
import IrcWhoisCard from '@/components/Chat/IrcWhoisCard.vue'
import UserPreviewCard from '@/components/Shared/UserPreviewCard.vue'
import { SERVICE_NICKS, useIrcChat, whoisStore } from '@/composables/useIrcChat'
import { useIrcNickResolver } from '@/composables/useIrcNickResolver'

const props = defineProps<{
  nick: string | null
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const { requestWhois, buffers } = useIrcChat()
const { resolved, resolve } = useIrcNickResolver()

watch(() => [props.open, props.nick] as [boolean, string | null], ([open, nick]) => {
  if (open && nick) {
    requestWhois(nick)
    resolve([nick.toLowerCase()])
  }
}, { immediate: true })

const userId = computed(() => {
  if (!props.nick)
    return null
  return resolved.value.get(props.nick.toLowerCase())?.id ?? null
})

const whois = computed(() => {
  if (!props.nick)
    return null
  return whoisStore.value.get(props.nick.toLowerCase()) ?? null
})

const isService = computed(() => {
  if (!props.nick)
    return false
  return SERVICE_NICKS.has(props.nick.toLowerCase())
})

const isBot = computed(() => {
  if (!props.nick)
    return false
  const nameLower = props.nick.toLowerCase()
  return buffers.value.some(b => b.users?.some(u => u.name.toLowerCase() === nameLower && u.bot))
})
</script>

<template>
  <Modal v-if="nick" :open="open" size="s" @close="emit('close')">
    <template #header>
      <h4 style="margin:0">
        {{ nick }}
      </h4>
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
