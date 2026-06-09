<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { ChannelGroupNode, ChannelItemNode, ChannelTreeNode } from '@/components/Chat/ChannelTreeItem.vue'
import type { ChatBuffer } from '@/composables/useIrcChat'
import { Badge, Button, ContextMenu, Divider, DropdownItem, Flex, Input, Overflow, pushToast, Sheet, Tooltip } from '@dolanske/vui'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import ChannelModeBadges from '@/components/Chat/ChannelModeBadges.vue'
import ChannelTreeItem from '@/components/Chat/ChannelTreeItem.vue'
import AvatarMedia from '@/components/Shared/AvatarMedia.vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import { SERVICE_NICKS, useIrcChat } from '@/composables/useIrcChat'
import { useIrcNickResolver } from '@/composables/useIrcNickResolver'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{
  // Horizontal strip layout for the compact navbar sheet.
  horizontal?: boolean
}>()

const { buffers, activeName, setActive, closeBuffer, joinChannel, channelBrowserOpen, markBufferRead, channelSettingsOpen, myChannelRole } = useIrcChat()

const sortedBuffers = computed(() => {
  const server = buffers.value.filter(b => b.kind === 'server')
  const rest = buffers.value.filter(b => b.kind !== 'server')
  const sorted = [...rest].sort((a, b) => {
    const cmp = a.name.localeCompare(b.name)
    return cmp
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

function bufferLabel(buf: ChatBuffer) {
  if (buf.kind === 'server')
    return 'Server'
  return buf.metadata?.get('display-name') ?? buf.name.replace(/^#/, '')
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
// sees flat channel names as-is.

const channelTree = computed<ChannelTreeNode[]>(() => {
  const groupByPath = new Map<string, ChannelGroupNode>()

  function getOrCreateGroup(list: ChannelTreeNode[], fullPath: string, name: string): ChannelGroupNode {
    const existing = groupByPath.get(fullPath)
    if (existing)
      return existing

    const node: ChannelGroupNode = { type: 'group', name, fullPath, parentBuffer: null, children: [] }
    groupByPath.set(fullPath, node)

    // If a matching leaf is already at this level, replace it in-place (preserves sort order)
    const leafIdx = list.findIndex(
      n => n.type === 'channel' && n.buffer.kind === 'channel' && n.buffer.name.replace(/^#/, '') === fullPath,
    )
    if (leafIdx !== -1) {
      node.parentBuffer = (list[leafIdx] as ChannelItemNode).buffer
      list.splice(leafIdx, 1, node)
    }
    else {
      list.push(node)
    }
    return node
  }

  const root: ChannelTreeNode[] = []

  for (const buf of sortedBuffers.value) {
    if (buf.kind !== 'channel') {
      const displayName = buf.kind === 'server' ? 'Server' : buf.name
      root.push({ type: 'channel', buffer: buf, displayName })
      continue
    }

    const rawName = buf.name.replace(/^#/, '')
    const segments = rawName.split('/').filter(Boolean)

    if (segments.length <= 1) {
      // Check if a group with this path was already created (child came first in sort order)
      const existingGroup = groupByPath.get(rawName)
      if (existingGroup) {
        existingGroup.parentBuffer = buf
      }
      else {
        root.push({ type: 'channel', buffer: buf, displayName: rawName })
      }
      continue
    }

    // Multi-segment: navigate/create groups for all but the last segment
    let currentList: ChannelTreeNode[] = root
    for (let i = 0; i < segments.length - 1; i++) {
      const groupPath = segments.slice(0, i + 1).join('/')
      const group = getOrCreateGroup(currentList, groupPath, segments[i]!)
      currentList = group.children
    }

    const lastSegment = segments[segments.length - 1]!
    currentList.push({ type: 'channel', buffer: buf, displayName: lastSegment })
  }

  return root
})

function treeNodeKey(node: ChannelTreeNode): string {
  if (node.type === 'group')
    return `group:${node.fullPath}`
  return node.buffer.name
}

// ---- Context menu ----

const menuBuffer = ref<ChatBuffer | null>(null)
const mobileMenuOpen = ref(false)

function onContextMenu(event: MouseEvent) {
  const el = (event.target as HTMLElement | null)?.closest('[data-channel-name]') as HTMLElement | null
  const name = el?.dataset.channelName ?? null
  menuBuffer.value = name ? (buffers.value.find(b => b.name === name) ?? null) : null

  // Force-close any other open VUI ContextMenu (user list, message log) and our
  // own stale popout before this one opens. VUI ContextMenu only closes on an
  // outside pointerdown, and a right-click inside its own anchor doesn't count -
  // so sibling menus and empty-space clicks leave stale menus open (see VUI issue).
  if (import.meta.client) {
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }

  // No channel/PM under the cursor (empty space) - suppress the menu entirely.
  if (!menuBuffer.value) {
    event.stopPropagation()
    return
  }

  if (isMobile.value) {
    event.stopPropagation()
    mobileMenuOpen.value = true
  }
}

// VUI ContextMenu closes on outside pointerdown + click. Defer via setTimeout
// so the dispatch runs after the current event cycle finishes.
function closeMenu() {
  if (!import.meta.client)
    return
  mobileMenuOpen.value = false
  setTimeout(() => {
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }, 0)
}

function buildChannelLink(bufName: string): string {
  const clean = bufName.replace(/^#/, '')
  const origin = import.meta.client ? window.location.origin : ''
  return `${origin}/chat?channel=${encodeURIComponent(clean)}`
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    pushToast(`${label} copied`)
  }
  catch {
    pushToast('Could not copy to clipboard')
  }
  closeMenu()
}

function canEditBuffer(buf: ChatBuffer): boolean {
  if (buf.kind !== 'channel')
    return false
  const r = myChannelRole(buf.name)
  return r !== null && ['~', '&', '@'].includes(r.symbol)
}

function openSettings(buf: ChatBuffer) {
  channelSettingsOpen.value = buf.name
  closeMenu()
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

    <ContextMenu class="chat-channels__context">
      <Overflow
        ref="listRef"
        :horizontal="horizontal || undefined"
        :hide-scrollbar="horizontal || undefined"
        :style="overflowStyle"
        class="chat-channels__list"
        :class="{ 'chat-channels__list--horizontal': horizontal }"
        @wheel="onWheel"
      >
        <Flex :gap="horizontal ? 'xxs' : 0" :column="!horizontal" :expand="!horizontal" @contextmenu.prevent="onContextMenu">
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
              placement="bottom"
              :disabled="isMobile || (!buf.topic && buf.users.length === 0)"
            >
              <button
                type="button"
                class="chat-channels__item"
                :class="{ 'chat-channels__item--active': buf.name.toLowerCase() === activeName.toLowerCase() }"
                :data-channel-name="buf.name"
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
                <template v-else-if="buf.kind === 'channel'">
                  <img
                    v-if="buf.metadata?.get('avatar')"
                    :src="buf.metadata.get('avatar')"
                    class="chat-channels__icon chat-channels__icon--avatar"
                    :alt="buf.name"
                  >
                  <Icon
                    v-else
                    :name="bufferIcon(buf.kind)"
                    size="13"
                    class="chat-channels__icon"
                    :style="buf.metadata?.get('color') ? { color: buf.metadata.get('color') } : undefined"
                  />
                </template>
                <Icon v-else :name="bufferIcon(buf.kind)" size="13" class="chat-channels__icon" />
                <Flex y-center gap="s" class="chat-channels__name-wrap">
                  <span
                    v-if="!(isMobile && buf.kind === 'server')"
                    class="chat-channels__name chat-channels__name--compact"
                  >{{ bufferLabel(buf) }}</span>
                  <ChannelModeBadges v-if="buf.kind === 'channel'" :modes="buf.modes" />
                  <ChannelModeBadges v-if="buf.kind === 'pm'" :is-service="isPmService(buf.name)" :is-bot="isPmBot(buf.name)" />
                </Flex>
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
                  <p v-if="buf.topic" class="text-xs" style="margin:0">
                    {{ buf.topic }}
                  </p>
                  <span v-if="buf.users.length" class="text-xxs text-color-light">
                    {{ buf.users.length }} {{ buf.users.length === 1 ? 'user' : 'users' }}
                  </span>
                </Flex>
              </template>
            </Tooltip>
          </template>

          <!-- Vertical mode: tree rendering with collapsible groups -->
          <template v-else>
            <template v-for="node in channelTree" :key="treeNodeKey(node)">
              <ChannelTreeItem :node="node" :depth="0" />
            </template>
          </template>
        </Flex>
      </Overflow>

      <template #menu>
        <div class="vui-dropdown chat-channels__menu" @click="closeMenu">
          <template v-if="menuBuffer">
            <!-- Channel actions -->
            <template v-if="menuBuffer.kind === 'channel'">
              <DropdownItem @click="copyText(buildChannelLink(menuBuffer.name), 'Channel link')">
                <template #icon>
                  <Icon name="ph:link" />
                </template>
                Copy link
              </DropdownItem>
              <DropdownItem @click="copyText(menuBuffer.name, 'Channel name')">
                <template #icon>
                  <Icon name="ph:hash" />
                </template>
                Copy name
              </DropdownItem>
              <Divider />
              <DropdownItem v-if="menuBuffer.unread > 0 || menuBuffer.mentions > 0" @click="markBufferRead(menuBuffer.name)">
                <template #icon>
                  <Icon name="ph:check-circle" />
                </template>
                Mark as read
              </DropdownItem>
              <DropdownItem v-if="canEditBuffer(menuBuffer)" @click="openSettings(menuBuffer)">
                <template #icon>
                  <Icon name="ph:gear" />
                </template>
                Channel settings
              </DropdownItem>
              <Divider />
              <DropdownItem @click="closeBuffer(menuBuffer.name)">
                <template #icon>
                  <Icon name="ph:sign-out" class="text-color-red" />
                </template>
                Leave channel
              </DropdownItem>
            </template>

            <!-- PM actions -->
            <template v-else-if="menuBuffer.kind === 'pm'">
              <DropdownItem @click="copyText(menuBuffer.name, 'Nickname')">
                <template #icon>
                  <Icon name="ph:user" />
                </template>
                Copy nickname
              </DropdownItem>
              <Divider />
              <DropdownItem v-if="menuBuffer.unread > 0 || menuBuffer.mentions > 0" @click="markBufferRead(menuBuffer.name)">
                <template #icon>
                  <Icon name="ph:check-circle" />
                </template>
                Mark as read
              </DropdownItem>
              <Divider />
              <DropdownItem @click="closeBuffer(menuBuffer.name)">
                <template #icon>
                  <Icon name="ph:x" class="text-color-red" />
                </template>
                Close
              </DropdownItem>
            </template>
          </template>
        </div>
      </template>
    </ContextMenu>

    <!-- Mobile sheet -->
    <Sheet :open="mobileMenuOpen" @close="mobileMenuOpen = false">
      <template v-if="menuBuffer" #header>
        <h4>{{ menuBuffer.metadata?.get('display-name') ?? menuBuffer.name }}</h4>
      </template>
      <div class="vui-dropdown chat-channels__menu" @click="closeMenu">
        <template v-if="menuBuffer">
          <template v-if="menuBuffer.kind === 'channel'">
            <DropdownItem @click="copyText(buildChannelLink(menuBuffer.name), 'Channel link')">
              <template #icon>
                <Icon name="ph:link" />
              </template>
              Copy link
            </DropdownItem>
            <DropdownItem @click="copyText(menuBuffer.name, 'Channel name')">
              <template #icon>
                <Icon name="ph:hash" />
              </template>
              Copy name
            </DropdownItem>
            <Divider />
            <DropdownItem v-if="menuBuffer.unread > 0 || menuBuffer.mentions > 0" @click="markBufferRead(menuBuffer.name)">
              <template #icon>
                <Icon name="ph:check-circle" />
              </template>
              Mark as read
            </DropdownItem>
            <DropdownItem v-if="canEditBuffer(menuBuffer)" @click="openSettings(menuBuffer)">
              <template #icon>
                <Icon name="ph:gear" />
              </template>
              Channel settings
            </DropdownItem>
            <Divider />
            <DropdownItem @click="closeBuffer(menuBuffer.name)">
              <template #icon>
                <Icon name="ph:sign-out" class="text-color-red" />
              </template>
              Leave channel
            </DropdownItem>
          </template>

          <template v-else-if="menuBuffer.kind === 'pm'">
            <DropdownItem @click="copyText(menuBuffer.name, 'Nickname')">
              <template #icon>
                <Icon name="ph:user" />
              </template>
              Copy nickname
            </DropdownItem>
            <Divider />
            <DropdownItem v-if="menuBuffer.unread > 0 || menuBuffer.mentions > 0" @click="markBufferRead(menuBuffer.name)">
              <template #icon>
                <Icon name="ph:check-circle" />
              </template>
              Mark as read
            </DropdownItem>
            <Divider />
            <DropdownItem @click="closeBuffer(menuBuffer.name)">
              <template #icon>
                <Icon name="ph:x" class="text-color-red" />
              </template>
              Close
            </DropdownItem>
          </template>
        </template>
      </div>
    </Sheet>

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

  &__context {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    width: 100%;
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

  &__list--horizontal :deep(.chat-channels__item) {
    width: auto;
    white-space: nowrap;
    flex: 0 0 auto;
  }

  &__item--browse {
    padding: var(--space-xxs);
    min-width: 34px;
    justify-content: center;
  }

  &__join {
    padding: var(--space-xs);
    border-top: 1px solid var(--color-border-weak);
  }

  &__menu {
    min-width: 180px;
  }

  // These classes are rendered inside ChannelTreeItem (child component),
  // so :deep() is required to pierce the scoped boundary.
  :deep(.chat-channels__group-label) {
    display: block;
    padding: var(--space-xxs) var(--space-xs);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-lighter);
  }

  :deep(.chat-channels__children) {
    width: 100%;
    padding-left: 28px;
    display: flex;
    flex-direction: column;
  }

  :deep(.chat-channels__child-item) {
    position: relative;
    width: 100%;
  }

  // L-curve: vertical line from top of item down to its midpoint, then a horizontal elbow.
  // Last children show only this, giving the └ shape.
  :deep(.chat-channels__child-item::before) {
    content: '';
    position: absolute;
    left: -16px;
    top: 0;
    width: 12px;
    height: 17px;
    border-left: 2px solid var(--color-border);
    border-bottom: 2px solid var(--color-border);
    border-bottom-left-radius: var(--border-radius-s);
  }

  // Branch extension: vertical line from the item midpoint to its bottom edge.
  // Connects to the next sibling's ::before, spanning groups at any depth.
  :deep(.chat-channels__child-item:not(:last-child)::after) {
    content: '';
    position: absolute;
    left: -16px;
    top: 17px;
    bottom: 0;
    width: 2px;
    background: var(--color-border);
  }

  :deep(.chat-channels__item) {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
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
  }

  :deep(.chat-channels__item:hover) {
    background: var(--color-bg-medium);
  }

  :deep(.chat-channels__item:hover .chat-channels__close) {
    opacity: 1;
  }

  :deep(.chat-channels__item--active) {
    background: var(--color-bg-accent-lowered);
    color: var(--color-text);
  }

  :deep(.chat-channels__icon) {
    flex-shrink: 0;
    color: var(--color-text-lighter);
  }

  :deep(.chat-channels__icon--avatar) {
    width: 14px;
    height: 14px;
    border-radius: var(--border-radius-xs);
    object-fit: cover;
    color: unset;
  }

  :deep(.chat-channels__name-wrap) {
    flex: 1;
    min-width: 0;
  }

  :deep(.chat-channels__name) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  :deep(.chat-channels__name--compact) {
    font-size: var(--font-size-xs);
  }

  :deep(.chat-channels__bot-icon) {
    flex-shrink: 0;
    color: var(--color-text-lighter);
  }

  :deep(.chat-channels__badge) {
    flex-shrink: 0;
  }

  :deep(.chat-channels__close) {
    flex-shrink: 0;
    opacity: 0;
    transition: opacity var(--transition-fast);
  }
}
</style>
