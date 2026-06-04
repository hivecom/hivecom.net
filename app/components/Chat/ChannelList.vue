<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { ChatBuffer } from '@/composables/useIrcChat'
import { Badge, Button, ButtonGroup, Flex, Input, Overflow, Tooltip } from '@dolanske/vui'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import AvatarMedia from '@/components/Shared/AvatarMedia.vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import { useIrcChat } from '@/composables/useIrcChat'
import { useIrcNickResolver } from '@/composables/useIrcNickResolver'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{
  // Horizontal strip layout for the compact navbar sheet.
  horizontal?: boolean
}>()

const { buffers, activeName, setActive, closeBuffer, joinChannel, channelBrowserOpen } = useIrcChat()

type SortBy = 'name' | 'users'
const sortBy = ref<SortBy>('name')
const sortAsc = ref(true)

const sortedBuffers = computed(() => {
  const server = buffers.value.filter(b => b.kind === 'server')
  const rest = buffers.value.filter(b => b.kind !== 'server')
  const sorted = [...rest].sort((a, b) => {
    const cmp = sortBy.value === 'name'
      ? a.name.localeCompare(b.name)
      : a.users.length - b.users.length
    return sortAsc.value ? cmp : -cmp
  })
  return [...server, ...sorted]
})

const listRef = ref<ComponentPublicInstance | HTMLElement | null>(null)

// <component :is="Overflow"> gives a component instance, not a DOM node - unwrap $el.
function getListEl(): HTMLElement | null {
  const v = listRef.value
  if (!v)
    return null
  if (v instanceof HTMLElement)
    return v
  return (v as ComponentPublicInstance).$el as HTMLElement
}

function scrollActiveIntoView() {
  if (!props.horizontal)
    return
  const el = getListEl()
  if (!el)
    return
  const active = el.querySelector<HTMLElement>('.chat-channels__item--active')
  active?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
}

// Watch both activeName and buffers length: opening a new PM changes both in
// the same tick, so nextTick after activeName alone fires before the item renders.
watch([activeName, () => buffers.value.length], () => nextTick(scrollActiveIntoView))
onMounted(() => nextTick(scrollActiveIntoView))

// Accent shadow when any buffer has unread mentions or unread PM messages.
const hasNotification = computed(() =>
  buffers.value.some(b => b.mentions > 0 || (b.kind === 'pm' && b.unread > 0)),
)

const overflowStyle = computed(() =>
  props.horizontal && hasNotification.value
    ? { '--vui-overflow-shadow-color': 'var(--color-accent)' }
    : undefined,
)

function onWheel(e: WheelEvent) {
  if (!props.horizontal || e.deltaX !== 0)
    return
  e.preventDefault()
  const el = getListEl()
  if (!el)
    return
  // Overflow's actual scroller is .overflow-content (not the root or its first child).
  const scroller = el.querySelector<HTMLElement>('.overflow-content') ?? el
  scroller.scrollLeft += e.deltaY
}

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

// ---- Channel tree (vertical sidebar only) ----
// Slash notation is a client-side rendering convention per the Orbit spec.
// #dev/frontend renders as group "dev" > child "frontend"; the IRC server
// sees flat channel names as always.

// parentBuffer: the flat channel that shares the group prefix (e.g. #playground
// when #playground/new exists). Rendered as the parent item in the tree.
// null means no matching flat channel exists - a virtual label is shown instead.
interface ChannelGroupNode {
  type: 'group'
  name: string
  parentBuffer: ChatBuffer | null
  children: ChatBuffer[]
}

interface ChannelItemNode {
  type: 'channel'
  buffer: ChatBuffer
}

type ChannelTreeNode = ChannelItemNode | ChannelGroupNode

const channelTree = computed<ChannelTreeNode[]>(() => {
  // Pass 1: collect all slash-channels into groups and mark their names.
  interface GroupData { children: ChatBuffer[] }
  const groupMap = new Map<string, GroupData>()
  const childNames = new Set<string>()

  for (const buf of buffers.value) {
    if (buf.kind !== 'channel')
      continue
    // Collapse consecutive slashes, discard leading/trailing empty segments.
    const segments = buf.name.replace(/^#/, '').split('/').filter(Boolean)
    if (segments.length <= 1)
      continue
    const groupName = segments[0]!
    if (!groupMap.has(groupName))
      groupMap.set(groupName, { children: [] })
    groupMap.get(groupName)!.children.push(buf)
    childNames.add(buf.name.toLowerCase())
  }

  // Pass 2: iterate buffers in order, emitting groups where they belong.
  const result: ChannelTreeNode[] = []
  const emittedGroups = new Set<string>()

  for (const buf of buffers.value) {
    const lower = buf.name.toLowerCase()

    // Child buffer: emit its group node here if not yet emitted, then skip.
    if (childNames.has(lower)) {
      const groupName = buf.name.replace(/^#/, '').split('/').filter(Boolean)[0]!
      if (!emittedGroups.has(groupName)) {
        emittedGroups.add(groupName)
        result.push({ type: 'group', name: groupName, parentBuffer: null, children: groupMap.get(groupName)!.children })
      }
      continue
    }

    // Non-channel (server, pm): always flat.
    if (buf.kind !== 'channel') {
      result.push({ type: 'channel', buffer: buf })
      continue
    }

    // Flat channel that matches a group prefix: becomes the parent node.
    const rawName = buf.name.replace(/^#/, '')
    if (groupMap.has(rawName) && !emittedGroups.has(rawName)) {
      emittedGroups.add(rawName)
      result.push({ type: 'group', name: rawName, parentBuffer: buf, children: groupMap.get(rawName)!.children })
      continue
    }

    result.push({ type: 'channel', buffer: buf })
  }

  return result
})

// Returns the display label for a channel within a group: strips the group prefix.
// #dev/frontend -> "frontend", #dev/backend/api -> "backend/api"
function childLabel(name: string): string {
  const segs = name.replace(/^#/, '').split('/').filter(Boolean)
  return segs.slice(1).join('/') || name
}

function treeNodeKey(node: ChannelTreeNode): string {
  if (node.type === 'group')
    return node.parentBuffer !== null ? `parent:${node.parentBuffer.name}` : `group:${node.name}`
  return node.buffer.name
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
      <Flex gap="xxs" y-center>
        <ButtonGroup>
          <Button :variant="sortBy === 'name' ? 'accent' : 'gray'" size="s" @click="sortBy = 'name'">
            Name
          </Button>
          <Button :variant="sortBy === 'users' ? 'accent' : 'gray'" size="s" @click="sortBy = 'users'">
            Users
          </Button>
        </ButtonGroup>
        <Button square plain size="s" :aria-label="sortAsc ? 'Sort descending' : 'Sort ascending'" @click="sortAsc = !sortAsc">
          <Icon :name="sortAsc ? 'ph:sort-ascending' : 'ph:sort-descending'" size="13" />
        </Button>
        <Button square plain size="s" aria-label="Browse channels" class="chat-channels__browse" @click="channelBrowserOpen = true">
          <Icon name="ph:compass" size="13" />
        </Button>
      </Flex>
    </Flex>

    <Overflow
      ref="listRef"
      :horizontal="horizontal || undefined"
      :hide-scrollbar="horizontal || undefined"
      :style="overflowStyle"
      class="chat-channels__list"
      :class="{ 'chat-channels__list--horizontal': horizontal }"
      @wheel="onWheel"
    >
      <Flex :gap="horizontal ? 'xxs' : 0" :column="!horizontal" :expand="!horizontal">
        <!-- Horizontal mode: flat list, no grouping -->
        <template v-if="horizontal">
          <Tooltip placement="bottom" :disabled="isMobile">
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
            v-for="buf in sortedBuffers"
            :key="buf.name"
            placement="right"
            :disabled="isMobile || (!buf.topic && buf.users.length === 0)"
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
                v-if="!(isMobile && buf.kind === 'server')"
                class="chat-channels__name chat-channels__name--compact"
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
        </template>

        <!-- Vertical mode: tree rendering with collapsible groups -->
        <template v-else>
          <template v-for="node in channelTree" :key="treeNodeKey(node)">
            <!-- Group node -->
            <template v-if="node.type === 'group'">
              <!-- Real parent channel: rendered as a normal item -->
              <Tooltip
                v-if="node.parentBuffer !== null"
                placement="right"
                :disabled="isMobile || (!node.parentBuffer.topic && node.parentBuffer.users.length === 0)"
              >
                <button
                  type="button"
                  class="chat-channels__item"
                  :class="{ 'chat-channels__item--active': node.parentBuffer.name.toLowerCase() === activeName.toLowerCase() }"
                  @click="setActive(node.parentBuffer.name)"
                  @mousedown.middle.prevent
                  @mouseup.middle.prevent="closeBuffer(node.parentBuffer.name)"
                >
                  <Icon name="ph:hash" size="13" class="chat-channels__icon" />
                  <span class="chat-channels__name">{{ bufferLabel(node.parentBuffer.name, node.parentBuffer.kind) }}</span>
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
              <!-- Virtual group: no matching channel, show a plain label -->
              <span v-else class="chat-channels__group-label">{{ node.name }}</span>
              <div class="chat-channels__children">
                <div
                  v-for="buf in node.children"
                  :key="buf.name"
                  class="chat-channels__child-item"
                >
                  <Tooltip
                    placement="right"
                    :disabled="isMobile || (!buf.topic && buf.users.length === 0)"
                  >
                    <button
                      type="button"
                      class="chat-channels__item"
                      :class="{ 'chat-channels__item--active': buf.name.toLowerCase() === activeName.toLowerCase() }"
                      @click="setActive(buf.name)"
                      @mousedown.middle.prevent
                      @mouseup.middle.prevent="closeBuffer(buf.name)"
                    >
                      <Icon :name="bufferIcon(buf.kind)" size="13" class="chat-channels__icon" />
                      <span class="chat-channels__name">{{ childLabel(buf.name) }}</span>
                      <Badge v-if="buf.mentions > 0" size="s" round variant="accent" class="chat-channels__badge">
                        {{ buf.mentions }}
                      </Badge>
                      <Badge v-else-if="buf.unread > 0" size="s" round variant="neutral" class="chat-channels__badge">
                        {{ buf.unread }}
                      </Badge>
                      <Button
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
                </div>
              </div>
            </template>

            <!-- Flat channel, server, or pm buffer -->
            <Tooltip
              v-else
              placement="right"
              :disabled="isMobile || (!node.buffer.topic && node.buffer.users.length === 0)"
            >
              <button
                type="button"
                class="chat-channels__item"
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
                <span class="chat-channels__name">{{ bufferLabel(node.buffer.name, node.buffer.kind) }}</span>
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
        </template>
      </Flex>
    </Overflow>

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
    padding: var(--space-xxs);
    width: 100%;

    :deep(.overflow-track),
    :deep(.overflow-content) {
      height: 100%;
    }

    &--horizontal {
      padding: 0;
    }
  }

  &__group-label {
    display: block;
    padding: var(--space-xxs) var(--space-xs);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-lighter);
  }

  &__children {
    width: 100%;
    padding-left: 34px;
    display: flex;
    flex-direction: column;
  }

  &__child-item {
    position: relative;
    width: 100%;

    &:not(:first-child)::after {
      height: 40px;
    }

    &::before {
      content: '';
      position: absolute;
      width: 16px;
      height: 16px;
      left: -21px;
      top: 0;
      border: 2px solid var(--color-border);
      clip-path: inset(8px 8px 0 0);
      border-radius: var(--border-radius-pill);
    }

    &::after {
      content: '';
      position: absolute;
      border-left: 2px solid var(--color-border);
      left: -21px;
      bottom: 22px;
      height: 18px;
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
