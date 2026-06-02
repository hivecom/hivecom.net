<script setup lang="ts">
import { Button, Flex, Input, Modal } from '@dolanske/vui'
import { ref, watch } from 'vue'
import { useIrcChat } from '@/composables/useIrcChat'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { nick, send } = useIrcChat()

const newNick = ref('')

watch(() => props.open, (val) => {
  if (val)
    newNick.value = nick.value
})

function confirm() {
  send(`NICK ${newNick.value}`)
  send(`PRIVMSG NickServ :GROUP`)
  emit('close')
}
</script>

<template>
  <Modal :open="open" size="s" @close="emit('close')">
    <template #header>
      <h4>Change nick</h4>
    </template>

    <Flex column gap="m" expand>
      <Input
        v-model="newNick"
        expand
        placeholder="New nickname"
        @keydown.enter.prevent="confirm"
      />
    </Flex>

    <template #footer>
      <Flex gap="xs" x-between expand>
        <Button @click="emit('close')">
          Cancel
        </Button>
        <Button
          variant="accent"
          :disabled="!newNick.trim() || newNick === nick"
          @click="confirm"
        >
          Change
        </Button>
      </Flex>
    </template>
  </Modal>
</template>
