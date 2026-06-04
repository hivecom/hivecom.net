<script setup lang="ts">
import { Badge, Button, Flex, Input, Tooltip } from '@dolanske/vui'
import AvatarMedia from '@/components/Shared/AvatarMedia.vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import { useIrcChat } from '@/composables/useIrcChat'
import { useIrcNickResolver } from '@/composables/useIrcNickResolver'
import { useBreakpoint } from '@/lib/mediaQuery'

defineProps<{
  // Horizontal strip layout for the compact navbar sheet.
  horizontal?: boolean
}>()

const { buffers, activeName, setActive, closeBuffer, joinChannel, channelBrowserOpen } = useIrcChat()

const isMobile = useBreakpoint('<s')

const { resolved, resolve } = useIrcNickResolver()

watch(buffers, (bufs) => {
  const pmNicks = bufs.filter(b => b.kind === 'pm').map(b => b.name.toLowerCase())
  if (pmNicks.length)
    resolve(pmNicks)
}, { immediate: true })

function resolvedUserId(name: string): string | null {
  return resolved.value.get(name.toLowerCase())?.id ?? null
}

const joinInput = ref('')

function bufferLabel(name: string, kind: string) {
  if (kind === 'server')
    return 'Server'
  return name.replace(/^#/, '')
}

function bufferIcon(kind: string) {
  if (kind === 'pm')
    return 'ph:user'
  if (kind === 'server')
    return 'ph:hard-drives'
  return 'ph:hash'
}

function onJoin() {
  const value = joinInput.value.trim()
  if (!value)
    return
  joinChannel(value)
  joinInput.value = ''
}
</script>

<template>
  <Flex
    :column="!horizontal"
    :gap="0"
    :wrap="horizontal"
    class="chat-channels"
    :class="{ 'chat-channels--horizontal': horizontal }"
    expand
  >
    <Flex v-if="!horizontal" expand y-center x-between class="chat-channels__header">
      <span class="chat-channels__title">Channels</span>
      <Button square plain size="s" aria-label="Browse channels" class="chat-channels__browse" @click="channelBrowserOpen = true">
        <Icon name="ph:compass" size="13" />
      </Button>
    </Flex>

    <component
      :is="horizontal ? Flex : 'div'"
      :gap="horizontal ? 'xxs' : undefined"
      class="chat-channels__list"
      :class="{ 'chat-channels__list--horizontal': horizontal }"
    >
      <Tooltip v-if="horizontal" placement="bottom">
        <button
          type="button"
          class="chat-channels__item chat-channels__item--browse"
          @click="channelBrowserOpen = true"
        >
          <Icon name="ph:compass" size="13" class="chat-channels__icon" />
        </button>
        <template #tooltip>
          <p>Browse channels</p>
        </template>
      </Tooltip>
      <Tooltip
        v-for="buf in buffers"
        :key="buf.name"
        placement="right"
        :disabled="!buf.topic && buf.users.length === 0"
      >
        <button
          type="button"
          class="chat-channels__item"
          :class="{ 'chat-channels__item--active': buf.name.toLowerCase() === activeName.toLowerCase() }"
          @click="setActive(buf.name)"
          @mousedown.middle.prevent
          @mouseup.middle.prevent="closeBuffer(buf.name)"
        >
          <template v-if="buf.kind === 'pm'">
            <UserAvatar v-if="resolvedUserId(buf.name)" :user-id="resolvedUserId(buf.name)!" :size="14" show-preview class="chat-channels__icon" />
            <AvatarMedia v-else :size="14" :alt="buf.name" class="chat-channels__icon">
              <template #default>
                {{ buf.name.charAt(0).toUpperCase() }}
              </template>
            </AvatarMedia>
          </template>
          <Icon v-else :name="bufferIcon(buf.kind)" size="13" class="chat-channels__icon" />
          <span
            v-if="!(horizontal && isMobile && (buf.kind === 'server' || buf.kind === 'pm'))"
            class="chat-channels__name"
            :class="{ 'chat-channels__name--compact': horizontal }"
          >{{ bufferLabel(buf.name, buf.kind) }}</span>
          <Badge v-if="buf.mentions > 0" size="s" round variant="accent" class="chat-channels__badge">
            {{ buf.mentions }}
          </Badge>
          <Badge v-else-if="buf.unread > 0" size="s" round variant="neutral" class="chat-channels__badge">
            {{ buf.unread }}
          </Badge>
          <Button
            v-if="buf.kind !== 'server'"
            square
            plain
            size="s"
            aria-label="Close"
            class="chat-channels__close"
            @click.stop="closeBuffer(buf.name)"
          >
            <Icon name="ph:x" size="12" />
          </Button>
        </button>
        <template #tooltip>
          <Flex column gap="xxs">
            <p v-if="buf.topic" class="chat-channels__topic">
              {{ buf.topic }}
            </p>
            <span v-if="buf.users.length" class="chat-channels__count">
              {{ buf.users.length }} {{ buf.users.length === 1 ? 'user' : 'users' }}
            </span>
          </Flex>
        </template>
      </Tooltip>
    </component>

    <Flex v-if="!horizontal" gap="xs" class="chat-channels__join" expand>
      <Input
        v-model="joinInput"
        expand
        size="s"
        placeholder="Create / Join #channel"
        @keydown.enter="onJoin"
      />
      <Button square aria-label="Join channel" :disabled="!joinInput.trim()" @click="onJoin">
        <Icon name="ph:plus" size="14" />
      </Button>
    </Flex>
  </Flex>
</template>

<style lang="scss" scoped>
.chat-channels {
  min-height: 0;
  width: 100%;

  &--horizontal {
    border-bottom: 1px solid var(--color-border-weak);
  }

  &__header {
    padding: var(--space-xs) var(--space-xs) var(--space-xs) var(--space-s);
    border-bottom: 1px solid var(--color-border-weak);
  }

  &__browse {
    flex-shrink: 0;
  }

  &__title {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-light);
  }

  &__list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-xxs);
    width: 100%;

    &--horizontal {
      overflow-x: auto;
      overflow-y: hidden;
    }
  }

  &__item {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    width: 100%;
    min-height: 34px;
    padding: var(--space-xxs) var(--space-xs);
    border: none;
    background: transparent;
    border-radius: var(--border-radius-s);
    font-size: var(--font-size-s);
    color: var(--color-text-light);
    cursor: pointer;
    text-align: left;
    transition: background-color var(--transition-fast);

    &:hover {
      background: var(--color-bg-medium);

      .chat-channels__close {
        opacity: 1;
      }
    }

    &--active {
      background: var(--color-bg-accent-lowered);
      color: var(--color-text);
    }
  }

  &__list--horizontal &__item {
    width: auto;
    white-space: nowrap;
    flex: 0 0 auto;
  }

  &__item--browse {
    padding: var(--space-xxs);
    min-width: 34px;
    justify-content: center;
  }

  &__icon {
    flex-shrink: 0;
    color: var(--color-text-lighter);
  }

  &__name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    &--compact {
      font-size: var(--font-size-xs);
    }
  }

  &__badge {
    flex-shrink: 0;
  }

  &__close {
    flex-shrink: 0;
    opacity: 0;
    transition: opacity var(--transition-fast);
  }

  &__topic {
    margin: 0;
    font-size: var(--font-size-s);
  }

  &__count {
    font-size: var(--font-size-xs);
    color: var(--color-text-light);
  }

  &__join {
    padding: var(--space-xs);
    border-top: 1px solid var(--color-border-weak);
  }
}
</style>
