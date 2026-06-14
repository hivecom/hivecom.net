<script setup lang="ts">
import { Button, Divider, Dropdown, DropdownItem, Flex, Input, Modal, pushToast, Sheet, Tooltip } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import UserRoleBadge from '@/components/Chat/UserRoleBadge.vue'
import AvatarMedia from '@/components/Shared/AvatarMedia.vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { channelRole, nickColor, useIrcChat } from '@/composables/useIrcChat'
import { useIrcNickResolver } from '@/composables/useIrcNickResolver'
import { useBreakpoint } from '@/lib/mediaQuery'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { users, nick, openPm, send, activeName, myChannelRole } = useIrcChat()
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

// ---- Mod actions sheet ----

const MOD_SYMBOLS = new Set(['~', '&', '@'])

const canModerate = computed(() => {
  const ch = activeName.value
  if (!ch)
    return false
  const r = myChannelRole(ch)
  return r !== null && MOD_SYMBOLS.has(r.symbol)
})

const sheetUser = ref<(typeof displayUsers.value)[number] | null>(null)
const sheetOpen = ref(false)

function openModSheet(user: (typeof displayUsers.value)[number]) {
  sheetUser.value = user
  sheetOpen.value = true
}

function closeSheet() {
  sheetOpen.value = false
}

function activeChannel(): string {
  return activeName.value ?? ''
}

async function copyNick(name: string) {
  try {
    await navigator.clipboard.writeText(name)
    pushToast('Nickname copied')
  }
  catch {
    pushToast('Could not copy to clipboard')
  }
  closeSheet()
}

function doMention(name: string) {
  // No inputMessage access here; close and let user type
  closeSheet()
  emit('close')
}

function kickUser(name: string) {
  const ch = activeChannel()
  if (ch)
    send(`KICK ${ch} ${name}`)
  closeSheet()
}

function banUser(name: string) {
  const ch = activeChannel()
  if (ch)
    send(`MODE ${ch} +b ${name}!*@*`)
  closeSheet()
}

function kickBanUser(name: string) {
  const ch = activeChannel()
  if (ch) {
    send(`MODE ${ch} +b ${name}!*@*`)
    send(`KICK ${ch} ${name}`)
  }
  closeSheet()
}

function opUser(name: string) {
  const ch = activeChannel()
  if (ch)
    send(`MODE ${ch} +o ${name}`)
  closeSheet()
}

function deopUser(name: string) {
  const ch = activeChannel()
  if (ch)
    send(`MODE ${ch} -o ${name}`)
  closeSheet()
}

function voiceUser(name: string) {
  const ch = activeChannel()
  if (ch)
    send(`MODE ${ch} +v ${name}`)
  closeSheet()
}

function devoiceUser(name: string) {
  const ch = activeChannel()
  if (ch)
    send(`MODE ${ch} -v ${name}`)
  closeSheet()
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
        <!-- Role indicator -->
        <UserRoleBadge :role="user.role" class="user-list-modal__role-indicator" />

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
          <Flex y-center gap="xxs">
            <span class="user-list-modal__name" :style="userStyle(user.name)">{{ user.name }}</span>
            <Tooltip v-if="user.bot" :disabled="isMobile">
              <Icon name="ph:robot" size="12" class="user-list-modal__bot-icon" />
              <template #tooltip>
                Bot
              </template>
            </Tooltip>
          </Flex>
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
          <template v-if="canModerate && user.name !== nick">
            <Dropdown v-if="!isMobile" placement="bottom-end">
              <template #trigger="{ toggle }">
                <Button
                  square
                  plain
                  size="s"
                  aria-label="Mod actions"
                  class="vui-button-accent-weak vui-button-rounded"
                  @click.stop="toggle"
                >
                  <Icon name="ph:dots-three" size="14" />
                </Button>
              </template>
              <template #default="{ close }">
                <DropdownItem @click="copyNick(user.name); close()">
                  <template #icon>
                    <Icon name="ph:user" />
                  </template>
                  Copy nickname
                </DropdownItem>
                <DropdownItem @click="doMention(user.name); close()">
                  <template #icon>
                    <Icon name="ph:at" />
                  </template>
                  Mention
                </DropdownItem>
                <Divider />
                <DropdownItem v-if="!user.prefix.includes('@')" @click="opUser(user.name); close()">
                  <template #icon>
                    <Icon name="ph:shield-check" />
                  </template>
                  Op
                </DropdownItem>
                <DropdownItem v-if="user.prefix.includes('@')" @click="deopUser(user.name); close()">
                  <template #icon>
                    <Icon name="ph:shield-slash" />
                  </template>
                  Deop
                </DropdownItem>
                <DropdownItem v-if="!user.prefix.includes('+')" @click="voiceUser(user.name); close()">
                  <template #icon>
                    <Icon name="ph:microphone" />
                  </template>
                  Voice
                </DropdownItem>
                <DropdownItem v-if="user.prefix.includes('+')" @click="devoiceUser(user.name); close()">
                  <template #icon>
                    <Icon name="ph:microphone-slash" />
                  </template>
                  Devoice
                </DropdownItem>
                <Divider />
                <DropdownItem @click="kickUser(user.name); close()">
                  <template #icon>
                    <Icon name="ph:boot" class="text-color-yellow" />
                  </template>
                  Kick
                </DropdownItem>
                <DropdownItem @click="banUser(user.name); close()">
                  <template #icon>
                    <Icon name="ph:prohibit" class="text-color-red" />
                  </template>
                  Ban
                </DropdownItem>
                <DropdownItem @click="kickBanUser(user.name); close()">
                  <template #icon>
                    <Icon name="ph:prohibit" class="text-color-red" />
                  </template>
                  Kick &amp; ban
                </DropdownItem>
              </template>
            </Dropdown>
            <Button
              v-else
              square
              plain
              size="s"
              aria-label="Mod actions"
              class="vui-button-accent-weak vui-button-rounded"
              @click.stop="openModSheet(user)"
            >
              <Icon name="ph:dots-three" size="14" />
            </Button>
          </template>
        </Flex>
      </Flex>
    </div>
  </Modal>

  <Sheet :open="sheetOpen" position="bottom" @close="closeSheet">
    <template v-if="sheetUser" #header>
      <h4>{{ sheetUser.name }}</h4>
    </template>
    <div v-if="sheetUser" class="vui-dropdown user-list-modal__sheet-menu">
      <DropdownItem @click="copyNick(sheetUser.name)">
        <template #icon>
          <Icon name="ph:user" />
        </template>
        Copy nickname
      </DropdownItem>
      <DropdownItem @click="doMention(sheetUser.name)">
        <template #icon>
          <Icon name="ph:at" />
        </template>
        Mention
      </DropdownItem>
      <Divider />
      <DropdownItem v-if="!sheetUser.prefix.includes('@')" @click="opUser(sheetUser.name)">
        <template #icon>
          <Icon name="ph:shield-check" />
        </template>
        Op
      </DropdownItem>
      <DropdownItem v-if="sheetUser.prefix.includes('@')" @click="deopUser(sheetUser.name)">
        <template #icon>
          <Icon name="ph:shield-slash" />
        </template>
        Deop
      </DropdownItem>
      <DropdownItem v-if="!sheetUser.prefix.includes('+')" @click="voiceUser(sheetUser.name)">
        <template #icon>
          <Icon name="ph:microphone" />
        </template>
        Voice
      </DropdownItem>
      <DropdownItem v-if="sheetUser.prefix.includes('+')" @click="devoiceUser(sheetUser.name)">
        <template #icon>
          <Icon name="ph:microphone-slash" />
        </template>
        Devoice
      </DropdownItem>
      <Divider />
      <DropdownItem @click="kickUser(sheetUser.name)">
        <template #icon>
          <Icon name="ph:boot" class="text-color-yellow" />
        </template>
        Kick
      </DropdownItem>
      <DropdownItem @click="banUser(sheetUser.name)">
        <template #icon>
          <Icon name="ph:prohibit" class="text-color-red" />
        </template>
        Ban
      </DropdownItem>
      <DropdownItem @click="kickBanUser(sheetUser.name)">
        <template #icon>
          <Icon name="ph:prohibit" class="text-color-red" />
        </template>
        Kick &amp; ban
      </DropdownItem>
    </div>
  </Sheet>
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

  &__role-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    flex-shrink: 0;
  }

  &__avatar {
    flex-shrink: 0;
  }

  &__info {
    flex: 1;
    min-width: 0;
  }

  &__bot-icon {
    flex-shrink: 0;
    color: var(--color-text-lighter);
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

  &__sheet-menu {
    min-width: 180px;
  }
}
</style>
