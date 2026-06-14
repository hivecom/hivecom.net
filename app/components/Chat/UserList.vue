<script setup lang="ts">
import { Button, ContextMenu, Flex, Overflow, Sheet, Tooltip } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import IrcWhoisModal from '@/components/Chat/IrcWhoisModal.vue'
import UserActionMenu from '@/components/Chat/UserActionMenu.vue'
import UserListModal from '@/components/Chat/UserListModal.vue'
import UserRoleBadge from '@/components/Chat/UserRoleBadge.vue'
import AvatarMedia from '@/components/Shared/AvatarMedia.vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { channelRole, nickColor, useIrcChat } from '@/composables/useIrcChat'
import { useIrcNickResolver } from '@/composables/useIrcNickResolver'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{
  // When set, render a static (non-scrolling) list capped to this many users,
  // with a "show all" button opening the full modal. Used in the mobile nav sheet.
  limit?: number
}>()

const { users, nick, inputMessage, openPm, userMetaStore } = useIrcChat()

function ircMeta(name: string) {
  return userMetaStore.value.get(name.toLowerCase())
}
const { settings } = useDataUserSettings()
const { resolved, resolve } = useIrcNickResolver()
const isMobile = useBreakpoint('<s')

const userListOpen = ref(false)

watch(users, (newUsers) => {
  resolve(newUsers.map(u => u.name.toLowerCase()))
}, { immediate: true })

function resolvedUserId(name: string): string | null {
  return resolved.value.get(name.toLowerCase())?.id ?? null
}

const displayUsers = computed(() =>
  users.value.map(user => ({ ...user, role: channelRole(user.prefix) })),
)

const visibleUsers = computed(() =>
  props.limit ? displayUsers.value.slice(0, props.limit) : displayUsers.value,
)

const hiddenCount = computed(() =>
  props.limit ? Math.max(0, displayUsers.value.length - props.limit) : 0,
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

function ircDisplayName(name: string): string {
  return ircMeta(name)?.get('display-name') ?? name
}

function ircAvatarUrl(name: string): string | undefined {
  return ircMeta(name)?.get('avatar') || undefined
}

function ircStatus(name: string): string | undefined {
  return ircMeta(name)?.get('orbit.status') || undefined
}

// ---- Context menu ----

const menuUser = ref<string | null>(null)
const whoisModalOpen = ref(false)

function openWhois(name: string) {
  menuUser.value = name
  whoisModalOpen.value = true
  closeMenu()
}
const mobileMenuOpen = ref(false)

function onContextMenu(event: MouseEvent) {
  const el = (event.target as HTMLElement | null)?.closest('[data-user-name]') as HTMLElement | null
  const name = el?.dataset.userName ?? null
  menuUser.value = name ?? null
  if (isMobile.value) {
    event.stopPropagation()
    mobileMenuOpen.value = true
  }
}

function closeMenu() {
  if (!import.meta.client)
    return
  mobileMenuOpen.value = false
  setTimeout(() => {
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }, 0)
}

const menuUserData = computed(() =>
  menuUser.value ? (displayUsers.value.find(u => u.name === menuUser.value) ?? null) : null,
)
</script>

<template>
  <Flex column :gap="0" class="chat-users" expand>
    <Flex y-center x-between class="chat-users__header" expand>
      <span class="chat-users__title">Channel Users</span>
      <Button square plain size="s" aria-label="User list" class="chat-users__list-btn" @click="userListOpen = true">
        <Icon name="ph:users" size="13" />
      </Button>
    </Flex>
    <ContextMenu class="chat-users__context w-100" :class="{ 'chat-users__context--static': limit }">
      <component :is="limit ? 'div' : Overflow" class="chat-users__list w-100">
        <Flex
          :gap="0"
          column
          expand
          @contextmenu.prevent="onContextMenu"
        >
          <Flex
            v-for="user in visibleUsers"
            :key="user.name"
            y-center
            expand
            class="chat-users__row"
            :class="{ 'chat-users__row--self': user.name === nick }"
            :data-user-name="user.name"
          >
            <span class="chat-users__indicator">
              <UserRoleBadge :role="user.role" icon />
            </span>
            <UserAvatar
              v-if="resolvedUserId(user.name)"
              :user-id="resolvedUserId(user.name)!"
              size="s"
              show-preview
              class="chat-users__avatar"
            />
            <AvatarMedia v-else-if="ircAvatarUrl(user.name)" :size="28" :url="ircAvatarUrl(user.name)" :alt="user.name" class="chat-users__avatar" />
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
              <span class="chat-users__name" :style="userStyle(user.name)">{{ ircDisplayName(user.name) }}</span>
              <span v-if="ircStatus(user.name)" class="chat-users__status">{{ ircStatus(user.name) }}</span>
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
          <Button v-if="hiddenCount > 0" plain expand size="s" class="chat-users__show-all" @click="userListOpen = true">
            Show all {{ displayUsers.length }} users
          </Button>
        </Flex>
      </component>

      <template #menu>
        <div class="vui-dropdown chat-users__menu" @click="closeMenu">
          <UserActionMenu
            v-if="menuUser"
            :nick="menuUser"
            :prefix="menuUserData?.prefix"
            show-mod-actions
            @close="closeMenu"
            @open-whois="openWhois"
          />
        </div>
      </template>
    </ContextMenu>

    <!-- Mobile sheet -->
    <Sheet :open="mobileMenuOpen" @close="mobileMenuOpen = false">
      <template v-if="menuUser" #header>
        <h4>{{ menuUser }}</h4>
      </template>
      <div class="vui-dropdown chat-users__menu" @click="closeMenu">
        <UserActionMenu
          v-if="menuUser"
          :nick="menuUser"
          :prefix="menuUserData?.prefix"
          show-mod-actions
          @close="closeMenu"
          @open-whois="openWhois"
        />
      </div>
    </Sheet>
  </Flex>
  <UserListModal :open="userListOpen" @close="userListOpen = false" />
  <IrcWhoisModal :nick="menuUser" :open="whoisModalOpen" @close="whoisModalOpen = false" />
</template>

<style lang="scss" scoped>
@use '@/assets/breakpoints.scss' as *;

.chat-users {
  &__header {
    padding: var(--space-xs) var(--space-xs) var(--space-xs) var(--space-s);
    border-bottom: 1px solid var(--color-border-weak);

    @media (max-width: $breakpoint-s) {
      padding: var(--space-m);
    }
  }

  &__title {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-light);
  }

  &__context {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;

    :deep(.vui-context-menu) {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    &--static {
      flex: 0 0 auto;

      :deep(.vui-context-menu) {
        flex: 0 0 auto;
      }

      .chat-users__list {
        flex: 0 0 auto;
        min-height: 0;
      }
    }
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
    width: 12px;
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

  &__status {
    font-size: var(--font-size-xxs);
    color: var(--color-text-lighter);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-shrink: 1;
  }

  &__empty {
    padding: var(--space-xs);
    font-size: var(--font-size-s);
    color: var(--color-text-lighter);
    font-style: italic;
  }

  &__menu {
    min-width: 180px;
  }

  &__list-btn {
    flex-shrink: 0;
  }

  &__show-all {
    margin-top: var(--space-xxs);
  }
}
</style>
