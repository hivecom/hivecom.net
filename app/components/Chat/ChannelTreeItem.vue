<script setup lang="ts">
import type { ChatBuffer } from '@/composables/useIrcChat'
import { Badge, Button, Flex, Tooltip } from '@dolanske/vui'
import ChannelModeBadges from '@/components/Chat/ChannelModeBadges.vue'
import ChannelTreeItem from '@/components/Chat/ChannelTreeItem.vue'
import AvatarMedia from '@/components/Shared/AvatarMedia.vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import { SERVICE_NICKS, useIrcChat } from '@/composables/useIrcChat'
import { useIrcNickResolver } from '@/composables/useIrcNickResolver'
import { useBreakpoint } from '@/lib/mediaQuery'

export interface ChannelGhostNode {
  type: 'ghost'
  name: string
  /** Full IRC channel name including prefix, e.g. "#playground/general" */
  fullChannelName: string
  displayName: string
}

export interface ChannelGroupNode {
  type: 'group'
  name: string
  fullPath: string
  parentBuffer: ChatBuffer | null
  /** Cached metadata for an unjoined parent (used to render its display-name). */
  meta?: Map<string, string> | null
  children: ChannelTreeNode[]
}

export interface ChannelItemNode {
  type: 'channel'
  buffer: ChatBuffer
  displayName: string
}

export type ChannelTreeNode = ChannelGroupNode | ChannelItemNode | ChannelGhostNode

const { node, depth } = defineProps<{
  node: ChannelTreeNode
  depth: number
}>()

const { activeName, buffers, setActive, closeBuffer, joinChannel, isUnauthorizedSubchannel, channelMetaCache } = useIrcChat()
const { resolved } = useIrcNickResolver()
const isMobile = useBreakpoint('<s')

function resolvedUserId(name: string): string | null {
  return resolved.value.get(name.toLowerCase())?.id ?? null
}

function isPmBot(name: string): boolean {
  const lower = name.toLowerCase()
  return buffers.value.some(b => b.users?.some(u => u.name.toLowerCase() === lower && u.bot))
}

function isPmService(name: string): boolean {
  return SERVICE_NICKS.has(name.toLowerCase())
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
        :data-channel-name="node.parentBuffer.name"
        @click="setActive(node.parentBuffer.name)"
        @mousedown.middle.prevent
        @mouseup.middle.prevent="closeBuffer(node.parentBuffer.name)"
      >
        <img
          v-if="node.parentBuffer.metadata?.get('avatar')"
          :src="node.parentBuffer.metadata.get('avatar')"
          class="chat-channels__icon chat-channels__icon--avatar"
          :alt="node.parentBuffer.name"
        >
        <Icon v-else name="ph:hash" size="13" class="chat-channels__icon" />
        <Flex y-center gap="s" class="chat-channels__name-wrap">
          <span class="chat-channels__name">{{ node.parentBuffer.metadata?.get('display-name') ?? node.name }}</span>
          <ChannelModeBadges :modes="node.parentBuffer.modes" shortform />
        </Flex>
        <Badge v-if="node.parentBuffer.mentions > 0" size="s" round variant="accent" class="chat-channels__badge">
          {{ node.parentBuffer.mentions }}
        </Badge>
        <Badge v-else-if="node.parentBuffer.unread > 0" size="s" round variant="neutral" class="chat-channels__badge">
          {{ node.parentBuffer.unread }}
        </Badge>
        <Button v-if="!isMobile" square plain size="s" aria-label="Close" class="chat-channels__close" @click.stop="closeBuffer(node.parentBuffer.name)">
          <Icon name="ph:x" size="12" />
        </Button>
      </button>
      <template #tooltip>
        <Flex column gap="xxs">
          <p v-if="node.parentBuffer.topic" class="text-xs" style="margin:0">
            {{ node.parentBuffer.topic }}
          </p>
          <span v-if="node.parentBuffer.users.length" class="text-xxs text-color-light">
            {{ node.parentBuffer.users.length }} {{ node.parentBuffer.users.length === 1 ? 'user' : 'users' }}
          </span>
        </Flex>
      </template>
    </Tooltip>
    <!-- No parent buffer: ghost button to join the parent channel -->
    <Tooltip
      v-else
      placement="right"
      :disabled="isMobile || !node.meta?.get('topic')"
    >
      <button
        type="button"
        class="chat-channels__item chat-channels__item--ghost w-100"
        @click="joinChannel(`#${node.fullPath}`)"
      >
        <img
          v-if="node.meta?.get('avatar')"
          :src="node.meta.get('avatar')!"
          class="chat-channels__icon chat-channels__icon--avatar"
          :alt="node.name"
        >
        <Icon v-else name="ph:hash" size="13" class="chat-channels__icon" />
        <span class="chat-channels__name">{{ node.meta?.get('display-name') ?? node.name }}</span>
      </button>
      <template #tooltip>
        <p v-if="node.meta?.get('topic')" class="text-xs" style="margin:0">
          {{ node.meta.get('topic') }}
        </p>
      </template>
    </Tooltip>

    <!-- Children -->
    <div class="chat-channels__children">
      <div v-for="child in node.children" :key="child.type === 'group' ? `group:${child.fullPath}` : child.type === 'ghost' ? `ghost:${child.fullChannelName}` : child.buffer.name" class="chat-channels__child-item">
        <ChannelTreeItem :node="child" :depth="depth + 1" />
      </div>
    </div>
  </template>

  <!-- Ghost node (unjoined subchannel known from parent metadata) -->
  <button
    v-else-if="node.type === 'ghost'"
    type="button"
    class="chat-channels__item chat-channels__item--ghost w-100"
    @click="joinChannel(node.fullChannelName)"
  >
    <Icon name="ph:hash" size="13" class="chat-channels__icon" />
    <span class="chat-channels__name">
      {{ channelMetaCache.get(node.fullChannelName.toLowerCase())?.get('display-name') ?? node.displayName }}
    </span>
  </button>

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
      :data-channel-name="node.buffer.name"
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
      <template v-else-if="node.buffer.kind === 'channel'">
        <img
          v-if="node.buffer.metadata?.get('avatar')"
          :src="node.buffer.metadata.get('avatar')"
          class="chat-channels__icon chat-channels__icon--avatar"
          :alt="node.buffer.name"
        >
        <Icon v-else :name="bufferIcon(node.buffer.kind)" size="13" class="chat-channels__icon" />
      </template>
      <Icon v-else :name="bufferIcon(node.buffer.kind)" size="13" class="chat-channels__icon" />
      <Flex y-center gap="s" class="chat-channels__name-wrap">
        <span class="chat-channels__name">{{ node.buffer.metadata?.get('display-name') ?? node.displayName }}</span>
        <ChannelModeBadges v-if="node.buffer.kind === 'channel'" :modes="node.buffer.modes" shortform />
        <ChannelModeBadges v-if="node.buffer.kind === 'pm'" :is-service="isPmService(node.buffer.name)" :is-bot="isPmBot(node.buffer.name)" compact />
        <Tooltip v-if="node.buffer.kind === 'channel' && isUnauthorizedSubchannel(node.buffer.name)" placement="top">
          <Badge variant="warning" size="s" outline class="chat-channels__unverified-badge">
            <Icon name="ph:warning" size="10" />
          </Badge>
          <template #tooltip>
            <p>Unverified subchannel - the parent channel has not authorized this.</p>
          </template>
        </Tooltip>
      </Flex>
      <Badge v-if="node.buffer.mentions > 0" size="s" round variant="accent" class="chat-channels__badge">
        {{ node.buffer.mentions }}
      </Badge>
      <Badge v-else-if="node.buffer.unread > 0" size="s" round variant="neutral" class="chat-channels__badge">
        {{ node.buffer.unread }}
      </Badge>
      <Button
        v-if="node.buffer.kind !== 'server' && !isMobile"
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
        <p v-if="node.buffer.topic" class="text-xs" style="margin:0">
          {{ node.buffer.topic }}
        </p>
        <span v-if="node.buffer.users.length" class="text-xxs text-color-light">
          {{ node.buffer.users.length }} {{ node.buffer.users.length === 1 ? 'user' : 'users' }}
        </span>
      </Flex>
    </template>
  </Tooltip>
</template>
