<script setup lang="ts">
import { Button, ContextMenu, Divider, DropdownItem, Flex, Overflow, Sheet, Tooltip, pushToast } from '@dolanske/vui' // eslint-disable-line perfectionist/sort-named-imports
import { computed, ref, watch } from 'vue'
import UserListModal from '@/components/Chat/UserListModal.vue'
import AvatarMedia from '@/components/Shared/AvatarMedia.vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { channelRole, nickColor, useIrcChat } from '@/composables/useIrcChat'
import { useIrcNickResolver } from '@/composables/useIrcNickResolver'
import { useBreakpoint } from '@/lib/mediaQuery'

const { users, nick, inputMessage, openPm, send, activeName, myChannelRole } = useIrcChat()
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

function mention(name: string) {
  const current = inputMessage.value.trim()
  inputMessage.value = current ? `${current} @${name} ` : `@${name}: `
}

function userStyle(name: string) {
  if (name !== nick.value && settings.value.chat_colored_nicks)
    return { color: nickColor(name) }
  return undefined
}

// ---- Context menu ----

const menuUser = ref<string | null>(null)
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

async function copyNick(name: string) {
  try {
    await navigator.clipboard.writeText(name)
    pushToast('Nickname copied')
  }
  catch {
    pushToast('Could not copy to clipboard')
  }
  closeMenu()
}

function doOpenPm(name: string) {
  openPm(name)
  closeMenu()
}

function doMention(name: string) {
  mention(name)
  closeMenu()
}

const menuUserData = computed(() =>
  menuUser.value ? (displayUsers.value.find(u => u.name === menuUser.value) ?? null) : null,
)

// Mod actions - require op or higher on the active channel

const MOD_SYMBOLS = new Set(['~', '&', '@'])

const canModerate = computed(() => {
  const ch = activeName.value
  if (!ch)
    return false
  const r = myChannelRole(ch)
  return r !== null && MOD_SYMBOLS.has(r.symbol)
})

function activeChannel(): string {
  return activeName.value ?? ''
}

function kickUser(name: string) {
  const ch = activeChannel()
  if (ch)
    send(`KICK ${ch} ${name}`)
  closeMenu()
}

function banUser(name: string) {
  const ch = activeChannel()
  if (ch)
    send(`MODE ${ch} +b ${name}!*@*`)
  closeMenu()
}

function kickBanUser(name: string) {
  const ch = activeChannel()
  if (ch) {
    send(`MODE ${ch} +b ${name}!*@*`)
    send(`KICK ${ch} ${name}`)
  }
  closeMenu()
}

function opUser(name: string) {
  const ch = activeChannel()
  if (ch)
    send(`MODE ${ch} +o ${name}`)
  closeMenu()
}

function deopUser(name: string) {
  const ch = activeChannel()
  if (ch)
    send(`MODE ${ch} -o ${name}`)
  closeMenu()
}

function voiceUser(name: string) {
  const ch = activeChannel()
  if (ch)
    send(`MODE ${ch} +v ${name}`)
  closeMenu()
}

function devoiceUser(name: string) {
  const ch = activeChannel()
  if (ch)
    send(`MODE ${ch} -v ${name}`)
  closeMenu()
}
</script>

<template>
  <Flex column :gap="0" class="chat-users" expand>
    <Flex y-center x-between class="chat-users__header" expand>
      <span class="chat-users__title">Users</span>
      <Button square plain size="s" aria-label="User list" class="chat-users__list-btn" @click="userListOpen = true">
        <Icon name="ph:users" size="13" />
      </Button>
    </Flex>
    <ContextMenu class="chat-users__context w-100">
      <Overflow class="chat-users__list w-100">
        <Flex
          :gap="0"
          column
          expand
          @contextmenu.prevent="onContextMenu"
        >
          <Flex
            v-for="user in displayUsers"
            :key="user.name"
            y-center
            expand
            class="chat-users__row"
            :class="{ 'chat-users__row--self': user.name === nick }"
            :data-user-name="user.name"
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
        </Flex>
      </Overflow>

      <template #menu>
        <div class="vui-dropdown chat-users__menu" @click="closeMenu">
          <template v-if="menuUser">
            <DropdownItem @click="copyNick(menuUser)">
              <template #icon>
                <Icon name="ph:user" />
              </template>
              Copy nickname
            </DropdownItem>
            <template v-if="menuUser !== nick">
              <DropdownItem @click="doOpenPm(menuUser)">
                <template #icon>
                  <Icon name="ph:chat-teardrop" />
                </template>
                Message
              </DropdownItem>
              <DropdownItem @click="doMention(menuUser)">
                <template #icon>
                  <Icon name="ph:at" />
                </template>
                Mention
              </DropdownItem>
              <template v-if="canModerate">
                <Divider />
                <DropdownItem v-if="!menuUserData?.prefix.includes('@')" @click="opUser(menuUser)">
                  <template #icon>
                    <Icon name="ph:shield-check" />
                  </template>
                  Op
                </DropdownItem>
                <DropdownItem v-if="menuUserData?.prefix.includes('@')" @click="deopUser(menuUser)">
                  <template #icon>
                    <Icon name="ph:shield-slash" />
                  </template>
                  Deop
                </DropdownItem>
                <DropdownItem v-if="!menuUserData?.prefix.includes('+')" @click="voiceUser(menuUser)">
                  <template #icon>
                    <Icon name="ph:microphone" />
                  </template>
                  Voice
                </DropdownItem>
                <DropdownItem v-if="menuUserData?.prefix.includes('+')" @click="devoiceUser(menuUser)">
                  <template #icon>
                    <Icon name="ph:microphone-slash" />
                  </template>
                  Devoice
                </DropdownItem>
                <Divider />
                <DropdownItem @click="kickUser(menuUser)">
                  <template #icon>
                    <Icon name="ph:boot" class="text-color-yellow" />
                  </template>
                  Kick
                </DropdownItem>
                <DropdownItem @click="banUser(menuUser)">
                  <template #icon>
                    <Icon name="ph:prohibit" class="text-color-red" />
                  </template>
                  Ban
                </DropdownItem>
                <DropdownItem @click="kickBanUser(menuUser)">
                  <template #icon>
                    <Icon name="ph:prohibit" class="text-color-red" />
                  </template>
                  Kick &amp; ban
                </DropdownItem>
              </template>
            </template>
          </template>
        </div>
      </template>
    </ContextMenu>

    <!-- Mobile sheet -->
    <Sheet :open="mobileMenuOpen" @close="mobileMenuOpen = false">
      <template v-if="menuUser" #header>
        <h4>{{ menuUser }}</h4>
      </template>
      <div class="vui-dropdown chat-users__menu" @click="closeMenu">
        <template v-if="menuUser">
          <DropdownItem @click="copyNick(menuUser)">
            <template #icon>
              <Icon name="ph:user" />
            </template>
            Copy nickname
          </DropdownItem>
          <template v-if="menuUser !== nick">
            <DropdownItem @click="doOpenPm(menuUser)">
              <template #icon>
                <Icon name="ph:chat-teardrop" />
              </template>
              Message
            </DropdownItem>
            <DropdownItem @click="doMention(menuUser)">
              <template #icon>
                <Icon name="ph:at" />
              </template>
              Mention
            </DropdownItem>
            <template v-if="canModerate">
              <Divider />
              <DropdownItem v-if="!menuUserData?.prefix.includes('@')" @click="opUser(menuUser)">
                <template #icon>
                  <Icon name="ph:shield-check" />
                </template>
                Op
              </DropdownItem>
              <DropdownItem v-if="menuUserData?.prefix.includes('@')" @click="deopUser(menuUser)">
                <template #icon>
                  <Icon name="ph:shield-slash" />
                </template>
                Deop
              </DropdownItem>
              <DropdownItem v-if="!menuUserData?.prefix.includes('+')" @click="voiceUser(menuUser)">
                <template #icon>
                  <Icon name="ph:microphone" />
                </template>
                Voice
              </DropdownItem>
              <DropdownItem v-if="menuUserData?.prefix.includes('+')" @click="devoiceUser(menuUser)">
                <template #icon>
                  <Icon name="ph:microphone-slash" />
                </template>
                Devoice
              </DropdownItem>
              <Divider />
              <DropdownItem @click="kickUser(menuUser)">
                <template #icon>
                  <Icon name="ph:boot" class="text-color-yellow" />
                </template>
                Kick
              </DropdownItem>
              <DropdownItem @click="banUser(menuUser)">
                <template #icon>
                  <Icon name="ph:prohibit" class="text-color-red" />
                </template>
                Ban
              </DropdownItem>
              <DropdownItem @click="kickBanUser(menuUser)">
                <template #icon>
                  <Icon name="ph:prohibit" class="text-color-red" />
                </template>
                Kick &amp; ban
              </DropdownItem>
            </template>
          </template>
        </template>
      </div>
    </Sheet>
  </Flex>
  <UserListModal :open="userListOpen" @close="userListOpen = false" />
</template>

<style lang="scss" scoped>
.chat-users {
  &__header {
    padding: var(--space-xs) var(--space-xs) var(--space-xs) var(--space-s);
    border-bottom: 1px solid var(--color-border-weak);
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

  &__menu {
    min-width: 180px;
  }

  &__list-btn {
    flex-shrink: 0;
  }
}
</style>
