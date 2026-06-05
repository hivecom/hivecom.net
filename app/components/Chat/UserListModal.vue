<script setup lang="ts">
import { Button, Flex, Input, Modal } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import AvatarMedia from '@/components/Shared/AvatarMedia.vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { channelRole, nickColor, useIrcChat } from '@/composables/useIrcChat'
import { useIrcNickResolver } from '@/composables/useIrcNickResolver'
import { useBreakpoint } from '@/lib/mediaQuery'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { users, nick, openPm } = useIrcChat()
const { settings } = useDataUserSettings()
const { resolved, resolve } = useIrcNickResolver()
const isMobile = useBreakpoint('<s')

const search = ref('')

watch(users, newUsers => resolve(newUsers.map(u => u.name.toLowerCase())), { immediate: true })

function resolvedUser(name: string) {
  return resolved.value.get(name.toLowerCase()) ?? null
}

const displayUsers = computed(() => {
  const q = search.value.trim().toLowerCase()
  return users.value
    .map(u => ({ ...u, role: channelRole(u.prefix) }))
    .filter(u => !q || u.name.toLowerCase().includes(q))
})

function userStyle(name: string) {
  if (name !== nick.value && settings.value.chat_colored_nicks)
    return { color: nickColor(name) }
  return undefined
}

function handlePm(name: string) {
  openPm(name)
  emit('close')
}
</script>

<template>
  <Modal :open="open" :size="isMobile ? 'screen' : 'm'" :card="{ separators: true }" @close="emit('close')">
    <template #header>
      <Flex y-center x-between expand gap="m">
        <Flex y-center gap="s">
          <h4>Users</h4>
          <span class="user-list-modal__count text-xs text-color-lighter">{{ users.length }}</span>
        </Flex>
        <Input
          v-model="search"
          size="s"
          placeholder="Filter users..."
          class="user-list-modal__search"
        />
      </Flex>
    </template>

    <div class="user-list-modal__list">
      <p v-if="displayUsers.length === 0" class="user-list-modal__empty">
        No users match.
      </p>
      <Flex
        v-for="user in displayUsers"
        :key="user.name"
        y-center
        expand
        gap="xs"
        class="user-list-modal__row"
        :class="{ 'user-list-modal__row--self': user.name === nick,
                  'user-list-modal__row--clickable': user.name !== nick }"
        @click="user.name !== nick && handlePm(user.name)"
      >
        <!-- Role dot -->
        <span class="user-list-modal__role-dot">
          <span
            v-if="user.role"
            class="user-list-modal__dot"
            :style="{ background: user.role.color }"
          />
        </span>

        <!-- Avatar -->
        <UserAvatar
          v-if="resolvedUser(user.name)"
          :user-id="resolvedUser(user.name)!.id"
          size="s"
          show-preview
          class="user-list-modal__avatar"
        />
        <AvatarMedia v-else :size="28" :alt="user.name" class="user-list-modal__avatar">
          {{ user.name.charAt(0).toUpperCase() }}
        </AvatarMedia>

        <!-- Name + role label -->
        <Flex column :gap="0" class="user-list-modal__info">
          <span class="user-list-modal__name" :style="userStyle(user.name)">{{ user.name }}</span>
          <span v-if="user.role" class="text-xs text-color-lighter">{{ user.role.label }}</span>
        </Flex>

        <!-- Actions -->
        <Flex gap="xxs" class="user-list-modal__actions" :class="{ 'user-list-modal__actions--visible': isMobile }" @click.stop>
          <NuxtLink
            v-if="resolvedUser(user.name)"
            :to="`/profile/${resolvedUser(user.name)!.username}`"
            @click="emit('close')"
          >
            <Button square plain size="s" aria-label="View profile" class="vui-button-accent-weak vui-button-rounded">
              <Icon name="ph:user" size="14" />
            </Button>
          </NuxtLink>
          <Button
            v-if="user.name !== nick"
            square
            plain
            size="s"
            aria-label="Message"
            class="vui-button-accent-weak vui-button-rounded"
            @click="handlePm(user.name)"
          >
            <Icon name="ph:chat-circle" size="14" />
          </Button>
        </Flex>
      </Flex>
    </div>
  </Modal>
</template>

<style lang="scss" scoped>
.user-list-modal {
  &__search {
    max-width: 180px;
  }

  &__list {
    display: flex;
    flex-direction: column;
    min-height: 200px;
    max-height: 420px;
    overflow-y: auto;
  }

  &__empty {
    padding: var(--space-m);
    font-size: var(--font-size-s);
    color: var(--color-text-lighter);
    font-style: italic;
    text-align: center;
  }

  &__row {
    padding: var(--space-xs) var(--space-s);
    border-radius: var(--border-radius-s);
    transition: background-color var(--transition-fast);

    &--clickable {
      cursor: pointer;
    }

    &:hover {
      background: var(--color-bg-medium);
    }

    &--self {
      color: var(--color-accent);
      font-weight: var(--font-weight-semibold);
    }
  }

  &__role-dot {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 10px;
    flex-shrink: 0;
  }

  &__dot {
    width: 7px;
    height: 7px;
    border-radius: var(--border-radius-pill);
    display: block;
  }

  &__avatar {
    flex-shrink: 0;
  }

  &__info {
    flex: 1;
    min-width: 0;
  }

  &__name {
    font-size: var(--font-size-s);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__actions {
    flex-shrink: 0;
    opacity: 0;
    transition: opacity var(--transition-fast);

    &--visible {
      opacity: 1;
    }

    .user-list-modal__row:hover & {
      opacity: 1;
    }
  }

  &__count {
    flex-shrink: 0;
  }
}
</style>
