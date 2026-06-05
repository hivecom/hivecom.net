<script setup lang="ts">
import { Flex, Overflow, Tooltip } from '@dolanske/vui'
import AvatarMedia from '@/components/Shared/AvatarMedia.vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { channelRole, nickColor, useIrcChat } from '@/composables/useIrcChat'
import { useIrcNickResolver } from '@/composables/useIrcNickResolver'
import { useBreakpoint } from '@/lib/mediaQuery'

const { users, nick, inputMessage, openPm } = useIrcChat()
const { settings } = useDataUserSettings()
const { resolved, resolve } = useIrcNickResolver()
const isMobile = useBreakpoint('<s')

watch(users, (newUsers) => {
  resolve(newUsers.map(u => u.name.toLowerCase()))
}, { immediate: true })

function resolvedUserId(name: string): string | null {
  return resolved.value.get(name.toLowerCase())?.id ?? null
}

const displayUsers = computed(() =>
  users.value.map(user => ({ ...user, role: channelRole(user.prefix) })),
)

function mention(name: string) {
  const current = inputMessage.value.trim()
  inputMessage.value = current ? `${current} @${name} ` : `@${name}: `
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
    <Overflow class="chat-users__list">
      <Flex
        v-for="user in displayUsers"
        :key="user.name"
        y-center
        expand
        class="chat-users__row"
        :class="{ 'chat-users__row--self': user.name === nick }"
      >
        <span class="chat-users__indicator">
          <Tooltip v-if="user.role" :disabled="isMobile">
            <Icon name="ph:circle-fill" size="8" :style="{ color: user.role.color }" />
            <template #tooltip>
              {{ user.role.label }}
            </template>
          </Tooltip>
        </span>
        <UserAvatar
          v-if="resolvedUserId(user.name)"
          :user-id="resolvedUserId(user.name)!"
          size="s"
          show-preview
          class="chat-users__avatar"
        />
        <AvatarMedia v-else :size="28" :alt="user.name" class="chat-users__avatar">
          <template #default>
            {{ user.name.charAt(0).toUpperCase() }}
          </template>
        </AvatarMedia>
        <button
          class="chat-users__item"
          type="button"
          @click="user.name !== nick ? openPm(user.name) : mention(user.name)"
        >
          <span class="chat-users__name" :style="userStyle(user.name)">{{ user.name }}</span>
          <Tooltip v-if="user.bot" :disabled="isMobile">
            <Icon name="ph:robot" size="12" class="chat-users__bot-icon" />
            <template #tooltip>
              Bot
            </template>
          </Tooltip>
        </button>
      </Flex>
      <p v-if="displayUsers.length === 0" class="chat-users__empty">
        No users.
      </p>
    </Overflow>
  </Flex>
</template>

<style lang="scss" scoped>
.chat-users {
  &__header {
    padding: var(--space-xs) var(--space-s) var(--space-m) var(--space-s);
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
    padding: var(--space-xxs);
    width: 100%;

    :deep(.overflow-track),
    :deep(.overflow-content) {
      height: 100%;
    }
  }

  &__row {
    border-radius: var(--border-radius-s);

    &:hover {
      background: var(--color-bg-medium);
    }

    &--self {
      color: var(--color-accent);
      font-weight: var(--font-weight-semibold);
    }
  }

  &__bot-icon {
    flex-shrink: 0;
    color: var(--color-text-lighter);
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
    margin-left: var(--space-xs);
  }

  &__avatar {
    flex-shrink: 0;
    margin-left: var(--space-xxs);

    width: 14px !important;
    height: 14px !important;

    :deep(.vui-avatar) {
      width: 16px;
      height: 16px;
    }

    :deep(.user-avatar__media-wrap) {
      width: 16px;
      height: 16px;

      img {
        width: 16px;
        height: 16px;
      }
    }
  }

  &__empty {
    padding: var(--space-xs);
    font-size: var(--font-size-s);
    color: var(--color-text-lighter);
    font-style: italic;
  }
}
</style>
