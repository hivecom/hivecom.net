<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { ChannelGhostNode, ChannelGroupNode, ChannelItemNode, ChannelTreeNode } from '@/components/Chat/ChannelTreeItem.vue'
import type { ChatBuffer } from '@/composables/useIrcChat'
import { Badge, Button, ContextMenu, Divider, Drawer, DropdownItem, Flex, Input, Modal, Overflow, pushToast, Tooltip } from '@dolanske/vui'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import ChannelInfoModal from '@/components/Chat/ChannelInfoModal.vue'
import ChannelModeBadges from '@/components/Chat/ChannelModeBadges.vue'
import ChannelTreeItem from '@/components/Chat/ChannelTreeItem.vue'
import IrcWhoisModal from '@/components/Chat/IrcWhoisModal.vue'
import AvatarMedia from '@/components/Shared/AvatarMedia.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { SERVICE_NICKS, useIrcChat } from '@/composables/useIrcChat'
import { useIrcNickResolver } from '@/composables/useIrcNickResolver'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{
  // Horizontal strip layout for the compact navbar sheet.
  horizontal?: boolean
  // Move the create/join input above the list (used in the mobile nav sheet).
  inputTop?: boolean
  // Size the list to its content instead of filling/scrolling internally, so a
  // parent surface can own the scroll (used in the mobile nav sheet).
  noScroll?: boolean
}>()

const { buffers, activeName, setActive, closeBuffer, joinChannel, renameChannel, channelBrowserOpen, markBufferRead, channelSettingsOpen, myChannelRole, channelMetaCache, channelMetaResolved, requestChannelMetadata, isUnauthorizedSubchannel, setChannelMetadata, queryChanServInfo } = useIrcChat()

// Proactively fetch metadata for every implied parent path so slash-nesting can
// be verified and the parent displayed even when we haven't joined it.
// draft/metadata-2 allows METADATA LIST on any channel target.
watch(buffers, () => {
  for (const buf of buffers.value) {
    if (buf.kind !== 'channel')
      continue
    const prefix = buf.name[0] ?? '#'
    const segments = buf.name.replace(/^[#&]/, '').split('/').filter(Boolean)
    for (let i = 1; i < segments.length; i++)
      requestChannelMetadata(`${prefix}${segments.slice(0, i).join('/')}`)
  }
}, { immediate: true })

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

    const node: ChannelGroupNode = { type: 'group', name, fullPath, parentBuffer: null, meta: channelMeta(fullPath) ?? null, children: [] }
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

  // Locate an open channel buffer by its slash path (case-insensitive, no #).
  function findChannelBuffer(path: string): ChatBuffer | undefined {
    const target = path.toLowerCase()
    return sortedBuffers.value.find(
      b => b.kind === 'channel' && b.name.replace(/^#/, '').toLowerCase() === target,
    )
  }

  // Resolve a channel's metadata from its open buffer, falling back to the
  // metadata cache (covers parents we've fetched but not joined).
  // Cache keys include the channel prefix (e.g. "#playground"), so try both
  // "#path" and bare "path" to handle # and & channels.
  function channelMeta(path: string): Map<string, string> | undefined {
    return findChannelBuffer(path)?.metadata
      ?? channelMetaCache.value.get(`#${path}`.toLowerCase())
      ?? channelMetaCache.value.get(path.toLowerCase())
  }

  // A parent authorizes a direct child leaf when its `subchannels` metadata
  // (comma-separated) lists that leaf. Only ops/founder can set channel
  // metadata, so the parent's allowlist is the authority - a squatter cannot
  // make #playground claim their #playground/2.
  function parentAuthorizes(parentPath: string, childSegment: string): boolean {
    const resolvedKey1 = `#${parentPath}`.toLowerCase()
    const resolvedKey2 = parentPath.toLowerCase()
    const meta = channelMeta(parentPath)
    // Metadata not yet received (joined or not) - assume authorized (pending).
    if (!meta && !channelMetaResolved.value.has(resolvedKey1) && !channelMetaResolved.value.has(resolvedKey2))
      return true
    const raw = channelMeta(parentPath)?.get('subchannels')
    if (!raw)
      return false
    return raw
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)
      .includes(childSegment.toLowerCase())
  }

  // Nesting is all-or-nothing: every parent->child link in the chain must be
  // authorized, otherwise the channel renders flat at the top level.
  function isChainAuthorized(segments: string[]): boolean {
    for (let i = 1; i < segments.length; i++) {
      if (!parentAuthorizes(segments.slice(0, i).join('/'), segments[i]!))
        return false
    }
    return true
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

    // Unverified nesting: render flat at the top level using the full path so
    // an unauthorized child can't masquerade as belonging to the parent.
    if (!isChainAuthorized(segments)) {
      root.push({ type: 'channel', buffer: buf, displayName: rawName })
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

  // Inject ghost children for unjoined subchannels listed in parent metadata.
  // Also promotes leaf channel nodes with subchannel metadata into groups.
  function getSubchannelSegments(meta: Map<string, string> | undefined | null): string[] {
    const raw = meta?.get('subchannels')
    if (!raw)
      return []
    return raw.split(',').map(s => s.trim()).filter(Boolean)
  }

  function injectGhosts(nodes: ChannelTreeNode[]): ChannelTreeNode[] {
    const result: ChannelTreeNode[] = []
    for (const node of nodes) {
      if (node.type === 'group') {
        const meta = node.meta ?? node.parentBuffer?.metadata
        const subs = getSubchannelSegments(meta)
        const existingNames = new Set(node.children.map((c) => {
          if (c.type === 'group')
            return c.name.toLowerCase()
          if (c.type === 'channel')
            return c.displayName.toLowerCase()
          return (c as ChannelGhostNode).name.toLowerCase()
        }))
        for (const seg of subs) {
          if (!existingNames.has(seg.toLowerCase())) {
            node.children.push({
              type: 'ghost',
              name: seg,
              fullChannelName: `#${node.fullPath}/${seg}`,
              displayName: seg,
            })
          }
        }
        node.children = injectGhosts(node.children)
        result.push(node)
      }
      else if (node.type === 'channel' && node.buffer.kind === 'channel') {
        const subs = getSubchannelSegments(node.buffer.metadata)
        if (subs.length > 0) {
          const rawName = node.buffer.name.replace(/^#/, '')
          const group: ChannelGroupNode = {
            type: 'group',
            name: node.displayName,
            fullPath: rawName,
            parentBuffer: node.buffer,
            meta: node.buffer.metadata ?? null,
            children: subs.map(seg => ({
              type: 'ghost' as const,
              name: seg,
              fullChannelName: `#${rawName}/${seg}`,
              displayName: seg,
            })),
          }
          result.push(group)
        }
        else {
          result.push(node)
        }
      }
      else {
        result.push(node)
      }
    }
    return result
  }

  return injectGhosts(root)
})

function treeNodeKey(node: ChannelTreeNode): string {
  if (node.type === 'group')
    return `group:${node.fullPath}`
  if (node.type === 'ghost')
    return `ghost:${node.fullChannelName}`
  return node.buffer.name
}

// ---- Context menu ----

const menuBuffer = ref<ChatBuffer | null>(null)
const mobileMenuOpen = ref(false)

// Long-press detection for mobile - mirrors MessageLog.vue behaviour.
let _longPressTimer: ReturnType<typeof setTimeout> | null = null
let _touchStartX = 0
let _touchStartY = 0
const LONG_PRESS_MS = 500
const LONG_PRESS_SLOP = 8 // px - cancel if finger drifts (user is scrolling)

function onTouchStart(event: TouchEvent) {
  const touch = event.touches[0]
  if (!touch)
    return
  _touchStartX = touch.clientX
  _touchStartY = touch.clientY

  const el = (event.target as HTMLElement | null)?.closest('[data-channel-name]') as HTMLElement | null
  const name = el?.dataset.channelName ?? null
  const buf = name ? (buffers.value.find(b => b.name === name) ?? null) : null
  if (!buf || buf.kind === 'server')
    return

  _longPressTimer = setTimeout(() => {
    _longPressTimer = null
    menuBuffer.value = buf
    if (buf.kind === 'channel' && buf.registered === undefined && canEditBuffer(buf))
      queryChanServInfo(buf.name)
    mobileMenuOpen.value = true
  }, LONG_PRESS_MS)
}

function cancelLongPress() {
  if (_longPressTimer !== null) {
    clearTimeout(_longPressTimer)
    _longPressTimer = null
  }
}

function onTouchMove(event: TouchEvent) {
  if (_longPressTimer === null)
    return
  const touch = event.touches[0]
  if (!touch)
    return
  if (Math.abs(touch.clientX - _touchStartX) > LONG_PRESS_SLOP
    || Math.abs(touch.clientY - _touchStartY) > LONG_PRESS_SLOP) {
    cancelLongPress()
  }
}

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

  // No channel/PM under the cursor (empty space or server) - suppress the menu entirely.
  if (!menuBuffer.value || menuBuffer.value.kind === 'server') {
    event.stopPropagation()
    return
  }

  // Resolve registration status so the rename action can be shown/hidden (Ergo
  // refuses to rename registered channels with persistent history).
  if (menuBuffer.value.kind === 'channel' && menuBuffer.value.registered === undefined && canEditBuffer(menuBuffer.value))
    queryChanServInfo(menuBuffer.value.name)

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

const { settings } = useDataUserSettings()
const whoisModalNick = ref<string | null>(null)
const whoisModalOpen = ref(false)

function openWhois(name: string) {
  whoisModalNick.value = name
  whoisModalOpen.value = true
  closeMenu()
}

const channelInfoOpen = ref(false)

function openChannelInfo(buf: ChatBuffer) {
  menuBuffer.value = buf
  channelInfoOpen.value = true
  closeMenu()
}

const createSubchannelTarget = ref<ChatBuffer | null>(null)
const createSubchannelInput = ref('')

function openCreateSubchannel(buf: ChatBuffer) {
  createSubchannelTarget.value = buf
  createSubchannelInput.value = ''
  closeMenu()
}

function confirmCreateSubchannel() {
  const parent = createSubchannelTarget.value
  const slug = createSubchannelInput.value.trim().replace(/^[#&/]+/, '').replace(/\//g, '-')
  if (!parent || !slug)
    return
  const fullName = `${parent.name}/${slug}`
  // Update parent subchannels metadata.
  const existing = parent.metadata?.get('subchannels') ?? channelMetaCache.value.get(parent.name.toLowerCase())?.get('subchannels') ?? ''
  const list = existing ? existing.split(',').map(s => s.trim()).filter(Boolean) : []
  if (!list.map(s => s.toLowerCase()).includes(slug.toLowerCase())) {
    list.push(slug)
    setChannelMetadata(parent.name, 'subchannels', list.join(','))
  }
  joinChannel(fullName)
  createSubchannelTarget.value = null
  createSubchannelInput.value = ''
}

const renameChannelTarget = ref<ChatBuffer | null>(null)
const renameChannelInput = ref('')

function openRenameChannel(buf: ChatBuffer) {
  renameChannelTarget.value = buf
  renameChannelInput.value = buf.name.replace(/^[#&]/, '')
  closeMenu()
}

const renameChannelValid = computed(() => {
  const target = renameChannelTarget.value
  const slug = renameChannelInput.value.trim().replace(/^[#&]+/, '')
  if (!target || !slug)
    return false
  return `${target.name[0]}${slug}` !== target.name
})

const renameConfirmOpen = ref(false)

function confirmRenameChannel() {
  if (!renameChannelTarget.value || !renameChannelValid.value)
    return
  renameConfirmOpen.value = true
}

function executeRenameChannel() {
  const target = renameChannelTarget.value
  if (!target || !renameChannelValid.value)
    return
  renameChannel(target.name, renameChannelInput.value)
  renameConfirmOpen.value = false
  renameChannelTarget.value = null
  renameChannelInput.value = ''
}
</script>

<template>
  <Flex
    :column="!horizontal"
    :gap="0"
    :wrap="horizontal"
    class="chat-channels"
    :class="{ 'chat-channels--horizontal': horizontal,
              'chat-channels--input-top': inputTop && !horizontal,
              'chat-channels--no-scroll': noScroll && !horizontal }"
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
        <Flex :gap="horizontal ? 'xxs' : 0" :column="!horizontal" :expand="!horizontal" @contextmenu.prevent="onContextMenu" @touchstart.passive="onTouchStart" @touchmove.passive="onTouchMove" @touchend="cancelLongPress" @touchcancel="cancelLongPress">
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
                  <ChannelModeBadges v-if="buf.kind === 'channel'" :modes="buf.modes" compact />
                  <ChannelModeBadges v-if="buf.kind === 'pm'" :is-service="isPmService(buf.name)" :is-bot="isPmBot(buf.name)" compact />
                  <Tooltip v-if="buf.kind === 'channel' && isUnauthorizedSubchannel(buf.name)" placement="bottom">
                    <Badge variant="warning" size="s" outline class="chat-channels__unverified-badge">
                      <Icon name="ph:warning" size="10" />
                    </Badge>
                    <template #tooltip>
                      <p>Unverified subchannel - the parent channel has not authorized this.</p>
                    </template>
                  </Tooltip>
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
              <DropdownItem @click="openChannelInfo(menuBuffer)">
                <template #icon>
                  <Icon name="ph:info" />
                </template>
                About
              </DropdownItem>
              <Divider />
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
              <DropdownItem v-if="canEditBuffer(menuBuffer)" @click="openCreateSubchannel(menuBuffer)">
                <template #icon>
                  <Icon name="ph:git-branch" />
                </template>
                Create sub-channel
              </DropdownItem>
              <DropdownItem v-if="canEditBuffer(menuBuffer) && menuBuffer.registered === false" @click="openRenameChannel(menuBuffer)">
                <template #icon>
                  <Icon name="ph:pencil-simple" />
                </template>
                Rename channel
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
              <DropdownItem v-if="!isPmService(menuBuffer.name)" @click="openWhois(menuBuffer.name)">
                <template #icon>
                  <Icon name="ph:info" />
                </template>
                <template v-if="settings.chat_irc_native_modes">
                  WHOIS
                </template>
                <template v-else>
                  About
                </template>
              </DropdownItem>
              <Divider v-if="!isPmService(menuBuffer.name)" />
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

    <!-- Mobile drawer -->
    <Drawer :open="mobileMenuOpen" @close="mobileMenuOpen = false">
      <template v-if="menuBuffer" #header>
        <h4>{{ menuBuffer.metadata?.get('display-name') ?? menuBuffer.name }}</h4>
      </template>
      <div class="vui-dropdown chat-channels__menu" @click="closeMenu">
        <template v-if="menuBuffer">
          <template v-if="menuBuffer.kind === 'channel'">
            <DropdownItem @click="openChannelInfo(menuBuffer)">
              <template #icon>
                <Icon name="ph:info" />
              </template>
              About
            </DropdownItem>
            <Divider />
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
            <DropdownItem v-if="canEditBuffer(menuBuffer)" @click="openCreateSubchannel(menuBuffer)">
              <template #icon>
                <Icon name="ph:git-branch" />
              </template>
              Create sub-channel
            </DropdownItem>
            <DropdownItem v-if="canEditBuffer(menuBuffer) && menuBuffer.registered === false" @click="openRenameChannel(menuBuffer)">
              <template #icon>
                <Icon name="ph:pencil-simple" />
              </template>
              Rename channel
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
            <DropdownItem v-if="!isPmService(menuBuffer.name)" @click="openWhois(menuBuffer.name)">
              <template #icon>
                <Icon name="ph:info" />
              </template>
              <template v-if="settings.chat_irc_native_modes">
                WHOIS
              </template>
              <template v-else>
                About
              </template>
            </DropdownItem>
            <Divider v-if="!isPmService(menuBuffer.name)" />
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
    </Drawer>

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
  <IrcWhoisModal :nick="whoisModalNick" :open="whoisModalOpen" @close="whoisModalOpen = false" />
  <ChannelInfoModal :channel-name="menuBuffer?.kind === 'channel' ? menuBuffer.name : undefined" :open="channelInfoOpen" @close="channelInfoOpen = false" />
  <Modal :open="createSubchannelTarget !== null" size="s" @close="createSubchannelTarget = null">
    <template #header>
      <h4>Create sub-channel</h4>
    </template>
    <Flex column gap="m">
      <p class="text-s text-color-light" style="margin:0">
        Sub-channel of <strong class="text-s">{{ createSubchannelTarget?.name }}</strong>. Enter a name for the new sub-channel.
      </p>
      <Input
        v-model="createSubchannelInput"
        expand
        placeholder="sub-channel-name"
        autofocus
        @keydown.enter="confirmCreateSubchannel"
      />
    </Flex>
    <template #footer>
      <Flex gap="xs" x-end>
        <Button variant="gray" @click="createSubchannelTarget = null">
          Cancel
        </Button>
        <Button variant="fill" :disabled="!createSubchannelInput.trim()" @click="confirmCreateSubchannel">
          Create
        </Button>
      </Flex>
    </template>
  </Modal>
  <Modal :open="renameChannelTarget !== null" size="s" @close="renameChannelTarget = null">
    <template #header>
      <h4>Rename channel</h4>
    </template>
    <Flex column gap="m">
      <p class="text-s text-color-light" style="margin:0">
        Enter a new name for <strong class="text-s">{{ renameChannelTarget?.name }}</strong>.
      </p>
      <Flex column gap="xs" expand>
        <Input
          v-model="renameChannelInput"
          expand
          placeholder="new-channel-name"
          autofocus
          @keydown.enter="confirmRenameChannel"
        >
          <template #start>
            <span class="text-color-lighter">{{ renameChannelTarget?.name[0] ?? '#' }}</span>
          </template>
        </Input>
      </Flex>
    </Flex>
    <template #footer>
      <Flex gap="xs" x-end>
        <Button variant="gray" @click="renameChannelTarget = null">
          Cancel
        </Button>
        <Button variant="fill" :disabled="!renameChannelValid" @click="confirmRenameChannel">
          Rename
        </Button>
      </Flex>
    </template>
  </Modal>
  <ConfirmModal
    v-model:open="renameConfirmOpen"
    :confirm="executeRenameChannel"
    title="Rename this channel?"
    description="Renaming wipes the channel's message history. For a simple, cosmetic change, set a display name in channel settings instead."
    confirm-text="Rename"
    cancel-text="Cancel"
    :destructive="true"
  />
</template>

<style lang="scss" scoped>
.chat-channels {
  min-height: 0;
  width: 100%;

  &--horizontal {
    border-bottom: 1px solid var(--color-border-weak);
  }

  &--input-top &__header {
    order: -2;
  }

  &--input-top &__join {
    order: -1;
    border-top: none;
    border-bottom: 1px solid var(--color-border-weak);
  }

  // Content-height mode: let a parent surface own the scroll.
  &--no-scroll &__context,
  &--no-scroll &__list {
    flex: 0 0 auto;
  }

  &--no-scroll &__list :deep(.overflow-track),
  &--no-scroll &__list :deep(.overflow-content) {
    height: auto;
  }

  &__header {
    padding: var(--space-xs) var(--space-xs) var(--space-xs) var(--space-s);
    border-bottom: 1px solid var(--color-border-weak);

    @media (max-width: $breakpoint-s - 1) {
      padding: var(--space-m);
    }
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

  :deep(.chat-channels__item--ghost) {
    opacity: 0.5;
    cursor: pointer;

    &:hover {
      opacity: 0.75;
    }
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
