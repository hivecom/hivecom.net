<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import { useIrcChat } from '@/composables/useIrcChat'

const { users, nick, inputMessage } = useIrcChat()

function mention(name: string) {
  const current = inputMessage.value.trim()
  inputMessage.value = current ? `${current} ${name}: ` : `${name}: `
}
</script>

<template>
  <Flex column :gap="0" class="chat-users" expand>
    <Flex y-center x-between class="chat-users__header">
      <span class="chat-users__title">Users</span>
      <span class="chat-users__count">{{ users.length }}</span>
    </Flex>
    <div class="chat-users__list">
      <button
        v-for="user in users"
        :key="user"
        class="chat-users__item"
        :class="{ 'chat-users__item--self': user === nick }"
        type="button"
        @click="mention(user)"
      >
        <Icon name="ph:circle-fill" size="8" class="chat-users__dot" />
        {{ user }}
      </button>
      <p v-if="users.length === 0" class="chat-users__empty">
        No users.
      </p>
    </div>
  </Flex>
</template>

<style lang="scss" scoped>
.chat-users {
  min-height: 0;

  &__header {
    padding: var(--space-xs) var(--space-s);
    border-bottom: 1px solid var(--color-border-weak);
  }

  &__title {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-light);
  }

  &__count {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
  }

  &__list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-xxs);
  }

  &__item {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    width: 100%;
    padding: var(--space-xxs) var(--space-xs);
    border: none;
    background: transparent;
    border-radius: var(--border-radius-s);
    font-size: var(--font-size-s);
    color: var(--color-text);
    cursor: pointer;
    text-align: left;
    transition: background-color var(--transition-fast);

    &:hover {
      background: var(--color-bg-medium);
    }

    &--self {
      color: var(--color-accent);
      font-weight: var(--font-weight-semibold);
    }
  }

  &__dot {
    color: var(--color-text-green);
    flex-shrink: 0;
  }

  &__empty {
    padding: var(--space-xs);
    font-size: var(--font-size-s);
    color: var(--color-text-lighter);
    font-style: italic;
  }
}
</style>
