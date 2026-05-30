<script setup lang="ts">
import { Button, Flex, Input } from '@dolanske/vui'
import { useIrcChat } from '@/composables/useIrcChat'

const { inputMessage, joinedChannel, sendMessage } = useIrcChat()
</script>

<template>
  <Flex gap="s" expand class="chat-composer">
    <Input
      v-model="inputMessage"
      class="chat-composer__input"
      :placeholder="`Message ${joinedChannel || 'channel'}...`"
      @keydown.enter="sendMessage"
    />
    <Button variant="accent" :disabled="!inputMessage.trim()" @click="sendMessage">
      Send
    </Button>
  </Flex>
</template>

<style lang="scss" scoped>
.chat-composer {
  align-items: stretch;

  &__input {
    flex: 1;
  }
}
</style>
