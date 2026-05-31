<script setup lang="ts">
import { Button, Flex, Tooltip } from '@dolanske/vui'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { channelRole, nickColor, useIrcChat } from '@/composables/useIrcChat'

const { users, nick, inputMessage, openPm } = useIrcChat()
const { settings } = useDataUserSettings()

const displayUsers = computed(() =>
  users.value.map(user => ({ ...user, role: channelRole(user.prefix) })),
)

function mention(name: string) {
  const current = inputMessage.value.trim()
  inputMessage.value = current ? `${current} ${name}: ` : `${name}: `
}

function userStyle(name: string) {
  if (name !== nick.value && settings.value.chat_colored_nicks)
    return { color: nickColor(name) }
  return undefined
}
</script>

<template>
  <Flex column :gap="0" class="chat-users" expand>
    <Flex y-center x-between class="chat-users__header" expand>
      <span class="chat-users__title">Users</span>
      <span class="chat-users__count">{{ users.length }}</span>
    </Flex>
    <div class="chat-users__list">
      <Flex
        v-for="user in displayUsers"
        :key="user.name"
        y-center
        expand
        class="chat-users__row"
        :class="{ 'chat-users__row--self': user.name === nick }"
      >
        <button
          class="chat-users__item"
          type="button"
          @click="mention(user.name)"
        >
          <span class="chat-users__indicator">
            <Tooltip v-if="user.role">
              <Icon name="ph:circle-fill" size="8" :style="{ color: user.role.color }" />
              <template #tooltip>
                {{ user.role.label }}
              </template>
            </Tooltip>
          </span>
          <span class="chat-users__name" :style="userStyle(user.name)">{{ user.name }}</span>
        </button>
        <Button
          v-if="user.name !== nick"
          square
          plain
          size="s"
          aria-label="Message"
          class="chat-users__pm"
          @click="openPm(user.name)"
        >
          <Icon name="ph:chat-circle" size="13" />
        </Button>
      </Flex>
      <p v-if="displayUsers.length === 0" class="chat-users__empty">
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
    width: 100%;
  }

  &__row {
    border-radius: var(--border-radius-s);

    &:hover {
      background: var(--color-bg-medium);

      .chat-users__pm {
        opacity: 1;
      }
    }

    &--self {
      color: var(--color-accent);
      font-weight: var(--font-weight-semibold);
    }
  }

  &__item {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    flex: 1;
    min-width: 0;
    padding: var(--space-xxs) var(--space-xs);
    border: none;
    background: transparent;
    font-size: var(--font-size-s);
    color: inherit;
    cursor: pointer;
    text-align: left;

    .chat-users__name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  &__indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 8px;
    flex-shrink: 0;
  }

  &__pm {
    flex-shrink: 0;
    opacity: 0;
    transition: opacity var(--transition-fast);
  }

  &__empty {
    padding: var(--space-xs);
    font-size: var(--font-size-s);
    color: var(--color-text-lighter);
    font-style: italic;
  }
}
</style>
