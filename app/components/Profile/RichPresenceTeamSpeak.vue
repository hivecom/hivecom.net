<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import type { TeamSpeakIdentityRecord } from '@/types/teamspeak'
import { Badge, Button, Divider, Flex } from '@dolanske/vui'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import RegionIndicator from '@/components/Shared/RegionIndicator.vue'
import { normalizeTeamSpeakIdentities } from '@/lib/teamspeak'

interface Props {
  profileId: string
  teamspeakIdentities: Tables<'profiles'>['teamspeak_identities'] | TeamSpeakIdentityRecord[] | null
  richPresenceDisabled?: boolean
  hideOnlineIndicator?: boolean
  iconSize?: number
  useAccentColor?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  richPresenceDisabled: false,
  hideOnlineIndicator: false,
  iconSize: 18,
  useAccentColor: false,
})

const ONLINE_WINDOW_MS = 15 * 60 * 1000
const ENTER_DELAY_MS = 120
const LEAVE_DELAY_MS = 150
const SPACER_PATTERN = /^\[spacer\d+\]/i

function sanitizeChannelSegment(segment: string | null | undefined): string | null {
  if (!segment)
    return null

  const cleaned = segment.replace(SPACER_PATTERN, '').trim()
  return cleaned.length ? cleaned : null
}

function buildChannelPath(row: PresenceRow): string {
  const cleanedPath = row.channel_path
    ?.map(sanitizeChannelSegment)
    .filter((segment): segment is string => Boolean(segment))

  if (cleanedPath?.length)
    return cleanedPath.join(' / ')

  const cleanedName = sanitizeChannelSegment(row.channel_name)
  return cleanedName || 'Unknown channel'
}

const normalizedIdentities = computed<TeamSpeakIdentityRecord[]>(() => normalizeTeamSpeakIdentities(props.teamspeakIdentities))
const hasIdentities = computed(() => normalizedIdentities.value.length > 0)

const supabase = useSupabaseClient()

const { data: presenceRows } = await useAsyncData(
  () => `teamspeak-presence-${props.profileId}`,
  async () => {
    if (props.richPresenceDisabled)
      return []

    const { data, error } = await supabase
      .from('presences_teamspeak')
      .select('*')
      .eq('profile_id', props.profileId)
      .order('updated_at', { ascending: false })

    if (error)
      return []

    return data ?? []
  },
  {
    default: () => [],
  },
)

const now = computed(() => Date.now())

type PresenceRow = Tables<'presences_teamspeak'>

const presenceEntries = computed(() => {
  const rows = (presenceRows.value ?? []) as PresenceRow[]
  return rows.map((row) => {
    const lastSeenMs = row.last_seen_at ? new Date(row.last_seen_at).getTime() : null
    const online = lastSeenMs ? now.value - lastSeenMs <= ONLINE_WINDOW_MS : false
    const path = buildChannelPath(row)
    const region = row.server_id?.toLowerCase() as 'eu' | 'na' | 'all' | undefined
    return {
      id: row.id,
      channelId: row.channel_id,
      serverId: row.server_id,
      serverLabel: row.server_id?.toUpperCase() ?? 'UNKNOWN',
      region,
      channelPath: path,
      lastSeenAt: row.last_seen_at,
      online,
    }
  })
})

const hasPresence = computed(() => presenceEntries.value.length > 0)
const showWidget = computed(() => hasIdentities.value || (hasPresence.value && !props.richPresenceDisabled))
const isOnline = computed(() => presenceEntries.value.some(entry => entry.online))

const anchorRef = ref<HTMLElement | null>(null)
const popoverRef = ref<HTMLElement | null>(null)
const popoverVisible = ref(false)
const popoverPosition = ref<{ top: number, left: number } | null>(null)
const popoverPlacement = ref<'bottom' | 'top'>('bottom')
const lastPopoverHeight = ref(0)
let showTimeout: ReturnType<typeof setTimeout> | null = null
let hideTimeout: ReturnType<typeof setTimeout> | null = null
let listenersAttached = false

function clearTimeouts() {
  if (showTimeout) {
    clearTimeout(showTimeout)
    showTimeout = null
  }
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }
}

function updatePopoverPosition() {
  if (typeof window === 'undefined')
    return

  const target = anchorRef.value
  if (!target)
    return

  const rect = target.getBoundingClientRect()
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight
  const offset = 8

  const popoverEl = popoverRef.value
  const popoverHeight = popoverEl?.offsetHeight ?? lastPopoverHeight.value
  if (popoverEl)
    lastPopoverHeight.value = popoverEl.offsetHeight

  let placement: 'bottom' | 'top' = 'bottom'
  let top = rect.bottom + offset
  const projectedBottom = top + (popoverHeight || 0)
  if (popoverHeight && projectedBottom > viewportHeight - offset) {
    placement = 'top'
    top = rect.top - offset
  }

  popoverPlacement.value = placement
  popoverPosition.value = {
    top,
    left: rect.left + rect.width / 2,
  }
}

function handleGlobalReposition() {
  if (popoverVisible.value)
    updatePopoverPosition()
}

function attachGlobalListeners() {
  if (listenersAttached || typeof window === 'undefined')
    return

  window.addEventListener('scroll', handleGlobalReposition, true)
  window.addEventListener('resize', handleGlobalReposition)
  listenersAttached = true
}

function detachGlobalListeners() {
  if (!listenersAttached || typeof window === 'undefined')
    return

  window.removeEventListener('scroll', handleGlobalReposition, true)
  window.removeEventListener('resize', handleGlobalReposition)
  listenersAttached = false
}

function handleEnter() {
  if (!showWidget.value)
    return

  if (showTimeout) {
    clearTimeout(showTimeout)
    showTimeout = null
  }
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }

  if (popoverVisible.value)
    return

  showTimeout = setTimeout(() => {
    popoverVisible.value = true
    nextTick(() => {
      updatePopoverPosition()
    }).catch(() => {})
  }, ENTER_DELAY_MS)
}

function handleLeave() {
  if (showTimeout) {
    clearTimeout(showTimeout)
    showTimeout = null
  }

  hideTimeout = setTimeout(() => {
    popoverVisible.value = false
  }, LEAVE_DELAY_MS)
}

onBeforeUnmount(() => {
  clearTimeouts()
  detachGlobalListeners()
})

watch(popoverVisible, (visible) => {
  if (visible) {
    updatePopoverPosition()
    attachGlobalListeners()
  }
  else {
    detachGlobalListeners()
  }
})

const popoverStyle = computed(() => {
  if (!popoverPosition.value)
    return undefined

  return {
    top: `${popoverPosition.value.top}px`,
    left: `${popoverPosition.value.left}px`,
  }
})

function formatLastSeen(lastSeenAt: string | null): string {
  if (!lastSeenAt)
    return 'Unknown'
  const date = new Date(lastSeenAt)
  if (Number.isNaN(date.getTime()))
    return 'Unknown'
  return date.toLocaleString()
}
</script>

<template>
  <div
    v-if="showWidget"
    ref="anchorRef"
    class="ts-presence"
    @mouseenter="handleEnter"
    @mouseleave="handleLeave"
    @focusin="handleEnter"
    @focusout="handleLeave"
  >
    <slot name="trigger">
      <Flex class="ts-presence__trigger" y-center gap="xs">
        <Icon class="activity-item__icon" name="mdi:teamspeak" :width="props.iconSize" :height="props.iconSize" />
        <span v-if="isOnline && !props.hideOnlineIndicator" class="ts-presence__badge" />
      </Flex>
    </slot>

    <Teleport to="body">
      <Transition name="ts-presence-fade">
        <div
          v-if="popoverVisible && popoverStyle"
          ref="popoverRef"
          class="ts-presence__popover"
          :class="`ts-presence__popover--${popoverPlacement}`"
          :style="popoverStyle"
          @mouseenter="handleEnter"
          @mouseleave="handleLeave"
          @focusin="handleEnter"
          @focusout="handleLeave"
        >
          <div class="ts-presence__tooltip">
            <strong class="text-l text-bold mb-s">
              TeamSpeak
            </strong>
            <div class="ts-presence__section">
              <div v-if="hasIdentities" class="ts-presence__list">
                <div v-for="identity in normalizedIdentities" :key="identity.uniqueId" class="ts-presence__row">
                  <span class="ts-presence__identity-label">Identity</span>
                  <span class="ts-presence__value">{{ identity.uniqueId }}</span>
                </div>
              </div>
              <div v-else class="ts-presence__empty">
                No TeamSpeak identities linked.
              </div>
            </div>
            <Divider v-if="hasPresence && !props.richPresenceDisabled" class="m-xxs p-xxs" :margin="0" />
            <div v-if="!props.richPresenceDisabled" class="ts-presence__section">
              <div v-if="hasPresence" class="ts-presence__list">
                <div
                  v-for="entry in presenceEntries"
                  :key="entry.id"
                  class="ts-presence__row"
                >
                  <Flex x-between expand y-center gap="s" wrap>
                    <Flex gap="xs" expand x-between y-center wrap>
                      <RegionIndicator :region="entry.region" show-label />
                      <Badge :variant="entry.online ? 'success' : 'neutral'" size="s">
                        {{ entry.online ? 'Online' : 'Offline' }}
                      </Badge>
                    </Flex>
                    <span v-if="entry.online" class="ts-presence__channel">{{ entry.channelPath }}</span>
                  </Flex>
                  <span class="ts-presence__meta">Last seen {{ formatLastSeen(entry.lastSeenAt) }}</span>

                  <Flex v-if="entry.online" x-start class="mt-xs">
                    <Button size="s" :href="`/servers/voiceservers#${entry.channelId}`">
                      Show TS viewer
                    </Button>
                  </Flex>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.ts-presence {
  display: inline-flex;
}

.ts-presence__trigger {
  cursor: pointer;
  color: var(--color-text);
  position: relative;
}

.ts-presence__trigger--accent {
  color: var(--color-accent);
}

.ts-presence__badge {
  position: absolute;
  top: -2px;
  right: -4px;
  width: 8px;
  height: 8px;
  display: block;
  border-radius: 999px;
  background: var(--color-accent);
  box-shadow: 0 0 0 2px var(--color-bg);
}

.ts-presence__popover {
  position: fixed;
  z-index: 9999;
  min-width: 360px;
  max-width: 440px;
  pointer-events: auto;
}

.ts-presence__popover--bottom {
  transform: translate(-50%, 0);
}

.ts-presence__popover--top {
  transform: translate(-50%, -100%);
}

.ts-presence-fade-enter-active,
.ts-presence-fade-leave-active {
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
}

.ts-presence-fade-enter-from,
.ts-presence-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -6px);
}

.ts-presence-fade-enter-to,
.ts-presence-fade-leave-from {
  opacity: 1;
  transform: translate(-50%, 0);
}

.ts-presence__popover--top.ts-presence-fade-enter-from,
.ts-presence__popover--top.ts-presence-fade-leave-to {
  transform: translate(-50%, calc(-100% - 6px));
}

.ts-presence__popover--top.ts-presence-fade-enter-to,
.ts-presence__popover--top.ts-presence-fade-leave-from {
  transform: translate(-50%, -100%);
}

.ts-presence__tooltip {
  width: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--space-m);
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.28);
  user-select: text;
}

.ts-presence__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ts-presence__row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--color-border-weak);
  border-radius: 10px;
  background: var(--color-bg-raised);
}

.ts-presence__value {
  font-size: var(--font-size-xs);
  font-family: var(--font-family-mono, monospace);
}

.ts-presence__identity-label {
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.02em;
  color: var(--color-text-light);
}

.ts-presence__channel {
  font-weight: 600;
}

.ts-presence__meta {
  font-size: 11px;
  color: var(--color-text-lighter);
}

.ts-presence__empty {
  font-size: var(--font-size-xs);
  color: var(--color-text-light);
}
</style>
