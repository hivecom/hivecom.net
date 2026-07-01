<script setup lang="ts">
import { Button, Flex, Input } from '@dolanske/vui'
import { ref } from 'vue'
import { useIrcChat } from '@/composables/useIrcChat'

const { channelBrowserOpen, joinChannel } = useIrcChat()

const channelInput = ref('')

function submitJoin() {
  const name = channelInput.value.trim()
  if (!name)
    return
  const target = name.startsWith('#') ? name : `#${name}`
  joinChannel(target)
  channelInput.value = ''
}
</script>

<template>
  <Flex column y-center x-center gap="l" class="chat-no-channels" expand>
    <Flex column y-center x-center gap="xs" class="chat-no-channels__hero">
      <Icon name="ph:hash" class="chat-no-channels__icon" />
      <span class="chat-no-channels__title">No channels open</span>
      <span class="chat-no-channels__subtitle">Browse channels or type a name to join one.</span>
    </Flex>
    <Flex column gap="s" class="chat-no-channels__actions">
      <Button variant="accent" @click="channelBrowserOpen = true">
        <template #start>
          <Icon name="ph:compass" />
        </template>
        Browse channels
      </Button>
      <form class="chat-no-channels__join-form" @submit.prevent="submitJoin">
        <Input
          v-model="channelInput"
          placeholder="#channel-name"
          class="chat-no-channels__input"
        />
        <Button type="submit" variant="gray">
          Join
        </Button>
      </form>
    </Flex>
  </Flex>
</template>

<style lang="scss" scoped>
.chat-no-channels {
  flex: 1;
  min-height: 0;

  &__icon {
    font-size: 2.4rem;
    color: var(--color-text-lighter);
  }

  &__title {
    font-size: var(--font-size-l);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text);
  }

  &__subtitle {
    font-size: var(--font-size-s);
    color: var(--color-text-light);
  }

  &__hero {
    text-align: center;
  }

  &__actions {
    width: 100%;
    max-width: 280px;
    align-items: stretch;
  }

  &__join-form {
    display: flex;
    gap: var(--space-xs);
  }

  &__input {
    flex: 1;
    min-width: 0;
  }
}
</style>
