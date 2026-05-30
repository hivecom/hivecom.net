<script setup lang="ts">
import { Button, Flex, Input } from '@dolanske/vui'
import { useIrcChat } from '@/composables/useIrcChat'

const { WS_URL, connState, inputNick, inputChannel, connect } = useIrcChat()

function onSubmit() {
  if (inputNick.value.trim() && inputChannel.value.trim())
    connect()
}
</script>

<template>
  <Flex column gap="s" expand>
    <Flex gap="s" wrap expand>
      <Flex column gap="xs" class="chat-connect__field">
        <label class="chat-connect__label">Nickname</label>
        <Input v-model="inputNick" expand placeholder="your-nick" @keydown.enter="onSubmit" />
      </Flex>
      <Flex column gap="xs" class="chat-connect__field">
        <label class="chat-connect__label">Channel</label>
        <Input v-model="inputChannel" expand placeholder="#general" @keydown.enter="onSubmit" />
      </Flex>
    </Flex>
    <Flex y-center gap="s" wrap>
      <Button
        variant="accent"
        :loading="connState === 'connecting'"
        :disabled="!inputNick.trim() || !inputChannel.trim()"
        @click="onSubmit"
      >
        Connect
      </Button>
      <span class="chat-connect__server">{{ WS_URL }}</span>
    </Flex>
  </Flex>
</template>

<style lang="scss" scoped>
.chat-connect {
  &__field {
    flex: 1;
    min-width: 140px;
  }

  &__label {
    font-size: var(--font-size-s);
    color: var(--color-text-light);
  }

  &__server {
    font-size: var(--font-size-s);
    color: var(--color-text-lighter);
  }
}
</style>
