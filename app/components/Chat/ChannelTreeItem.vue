<script setup lang="ts">
import type { ChatBuffer } from '@/composables/useIrcChat'
import { Badge, Button, Flex, Tooltip } from '@dolanske/vui'
import ChannelModeBadges from '@/components/Chat/ChannelModeBadges.vue'
import ChannelTreeItem from '@/components/Chat/ChannelTreeItem.vue'
import AvatarMedia from '@/components/Shared/AvatarMedia.vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import { useIrcChat } from '@/composables/useIrcChat'
import { useIrcNickResolver } from '@/composables/useIrcNickResolver'
import { useBreakpoint } from '@/lib/mediaQuery'

export interface ChannelGroupNode {
  type: 'group'
  name: string
  fullPath: string
  parentBuffer: ChatBuffer | null
  children: ChannelTreeNode[]
}

export interface ChannelItemNode {
  type: 'channel'
  buffer: ChatBuffer
  displayName: string
}

export type ChannelTreeNode = ChannelGroupNode | ChannelItemNode

const { node, depth } = defineProps<{
  node: ChannelTreeNode
  depth: number
}>()

const { activeName, setActive, closeBuffer } = useIrcChat()
const { resolved } = useIrcNickResolver()
const isMobile = useBreakpoint('<s')

function resolvedUserId(name: string): string | null {
  return resolved.value.get(name.toLowerCase())?.id ?? null
}

function bufferIcon(kind: string) {
  if (kind === 'pm')
    return 'ph:user'
  if (kind === 'server')
    return 'ph:hard-drives'
  return 'ph:hash'
}
</script>

<template>
  <!-- Group node -->
  <template v-if="node.type === 'group'">
    <!-- Parent buffer exists: render as a clickable item -->
    <Tooltip
      v-if="node.parentBuffer !== null"
      placement="right"
      :disabled="isMobile || (!node.parentBuffer.topic && node.parentBuffer.users.length === 0)"
    >
      <button
        type="button"
        class="chat-channels__item w-100"
        :class="{ 'chat-channels__item--active': node.parentBuffer.name.toLowerCase() === activeName.toLowerCase() }"
        @click="setActive(node.parentBuffer.name)"
        @mousedown.middle.prevent
        @mouseup.middle.prevent="closeBuffer(node.parentBuffer.name)"
      >
        <Icon name="ph:hash" size="13" class="chat-channels__icon" />
        <span class="chat-channels__name">{{ node.name }}</span>
        <ChannelModeBadges :buffer="node.parentBuffer" />
        <Badge v-if="node.parentBuffer.mentions > 0" size="s" round variant="accent" class="chat-channels__badge">
          {{ node.parentBuffer.mentions }}
        </Badge>
        <Badge v-else-if="node.parentBuffer.unread > 0" size="s" round variant="neutral" class="chat-channels__badge">
          {{ node.parentBuffer.unread }}
        </Badge>
        <Button square plain size="s" aria-label="Close" class="chat-channels__close" @click.stop="closeBuffer(node.parentBuffer.name)">
          <Icon name="ph:x" size="12" />
        </Button>
      </button>
      <template #tooltip>
        <Flex column gap="xxs">
          <p v-if="node.parentBuffer.topic" class="chat-channels__topic">
            {{ node.parentBuffer.topic }}
          </p>
          <span v-if="node.parentBuffer.users.length" class="chat-channels__count">
            {{ node.parentBuffer.users.length }} {{ node.parentBuffer.users.length === 1 ? 'user' : 'users' }}
          </span>
        </Flex>
      </template>
    </Tooltip>
    <!-- No parent buffer: virtual label -->
    <span v-else class="chat-channels__group-label">{{ node.name }}</span>

    <!-- Children -->
    <div class="chat-channels__children">
      <div v-for="child in node.children" :key="child.type === 'group' ? `group:${child.fullPath}` : child.buffer.name" class="chat-channels__child-item">
        <ChannelTreeItem :node="child" :depth="depth + 1" />
      </div>
    </div>
  </template>

  <!-- Leaf node -->
  <Tooltip
    v-else
    placement="right"
    :disabled="isMobile || (!node.buffer.topic && node.buffer.users.length === 0)"
  >
    <button
      type="button"
      class="chat-channels__item w-100"
      :class="{ 'chat-channels__item--active': node.buffer.name.toLowerCase() === activeName.toLowerCase() }"

      @click="setActive(node.buffer.name)"
      @mousedown.middle.prevent
      @mouseup.middle.prevent="closeBuffer(node.buffer.name)"
    >
      <template v-if="node.buffer.kind === 'pm'">
        <UserAvatar v-if="resolvedUserId(node.buffer.name)" :user-id="resolvedUserId(node.buffer.name)!" :size="14" show-preview class="chat-channels__icon" />
        <AvatarMedia v-else :size="14" :alt="node.buffer.name" class="chat-channels__icon">
          <template #default>
            {{ node.buffer.name.charAt(0).toUpperCase() }}
          </template>
        </AvatarMedia>
      </template>
      <Icon v-else :name="bufferIcon(node.buffer.kind)" size="13" class="chat-channels__icon" />
      <span class="chat-channels__name">{{ node.displayName }}</span>
      <ChannelModeBadges v-if="node.buffer.kind === 'channel'" :buffer="node.buffer" />
      <Badge v-if="node.buffer.mentions > 0" size="s" round variant="accent" class="chat-channels__badge">
        {{ node.buffer.mentions }}
      </Badge>
      <Badge v-else-if="node.buffer.unread > 0" size="s" round variant="neutral" class="chat-channels__badge">
        {{ node.buffer.unread }}
      </Badge>
      <Button
        v-if="node.buffer.kind !== 'server'"
        square
        plain
        size="s"
        aria-label="Close"
        class="chat-channels__close"
        @click.stop="closeBuffer(node.buffer.name)"
      >
        <Icon name="ph:x" size="12" />
      </Button>
    </button>
    <template #tooltip>
      <Flex column gap="xxs">
        <p v-if="node.buffer.topic" class="chat-channels__topic">
          {{ node.buffer.topic }}
        </p>
        <span v-if="node.buffer.users.length" class="chat-channels__count">
          {{ node.buffer.users.length }} {{ node.buffer.users.length === 1 ? 'user' : 'users' }}
        </span>
      </Flex>
    </template>
  </Tooltip>
</template>
