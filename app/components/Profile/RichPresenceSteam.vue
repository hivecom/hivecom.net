<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Badge, Button, Divider, Flex } from '@dolanske/vui'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

type SteamPresence = Omit<Tables<'presences_steam'>, 'details'> & {
  details?: unknown | null
}

interface Props {
  steamId?: string | null
  presence?: SteamPresence | null
  richPresenceDisabled?: boolean
  hideOnlineIndicator?: boolean
  iconSize?: number
  useAccentColor?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  presence: null,
  richPresenceDisabled: false,
  hideOnlineIndicator: false,
  iconSize: 18,
  useAccentColor: false,
})

const presenceRow = computed(() => props.presence)

const showWidget = computed(() => Boolean(props.steamId || presenceRow.value))
const hasPresence = computed(() => Boolean(presenceRow.value))

const statusLabel = computed(() => {
  if (!presenceRow.value?.status)
    return 'Unknown'

  const statusMap: Record<string, string> = {
    offline: 'Offline',
    online: 'Online',
    busy: 'Busy',
    away: 'Away',
    snooze: 'Snooze',
    looking_to_trade: 'Looking to Trade',
    looking_to_play: 'Looking to Play',
  }

  return statusMap[presenceRow.value.status] || presenceRow.value.status
})

const isOnline = computed(() => {
  const status = presenceRow.value?.status
  return Boolean(status && status !== 'offline')
})

const statusBadgeVariant = computed(() => {
  const status = presenceRow.value?.status
  if (!status || status === 'offline')
    return 'neutral'
  if (status === 'online')
    return 'success'
  if (status === 'busy')
    return 'danger'
  return 'warning'
})

const isPlaying = computed(() => {
  return Boolean(
    presenceRow.value?.status
    && presenceRow.value?.status !== 'offline'
    && presenceRow.value?.current_app_id
    && presenceRow.value?.current_app_name,
  )
})

const displayedAppId = computed(() => {
  if (presenceRow.value?.current_app_id)
    return presenceRow.value.current_app_id
  return presenceRow.value?.last_app_id ?? null
})

const displayedAppName = computed(() => {
  if (presenceRow.value?.current_app_name)
    return presenceRow.value.current_app_name
  return presenceRow.value?.last_app_name ?? null
})

const lastOnlineFormatted = computed(() => {
  if (!presenceRow.value?.last_online_at)
    return null

  const date = new Date(presenceRow.value.last_online_at)
  if (Number.isNaN(date.getTime()))
    return null

  return date.toLocaleString()
})

function getDetailString(details: unknown, key: 'game_icon_url' | 'game_icon' | 'game_icon_hash') {
  if (!details || typeof details !== 'object' || Array.isArray(details))
    return null

  const record = details as { [key: string]: unknown }
  const value = record[key]
  return typeof value === 'string' ? value : null
}

const gameIconIndex = ref(0)

const gameIconSources = computed(() => {
  const appId = displayedAppId.value
  if (!appId)
    return []

  const sources: string[] = []

  const details = presenceRow.value?.details as unknown
  const iconUrl = getDetailString(details, 'game_icon_url')
  const iconHash = getDetailString(details, 'game_icon') || getDetailString(details, 'game_icon_hash')

  if (iconUrl)
    sources.push(iconUrl)
  if (iconHash)
    sources.push(`https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${appId}/${iconHash}.jpg`)

  sources.push(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/capsule_sm_120.jpg`)
  sources.push(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`)

  return sources
})

const gameIconUrl = computed(() => {
  return gameIconSources.value[gameIconIndex.value] || null
})

function onGameIconError() {
  if (gameIconIndex.value < gameIconSources.value.length - 1) {
    gameIconIndex.value += 1
    return
  }

  gameIconIndex.value = gameIconSources.value.length
}

watch(displayedAppId, () => {
  gameIconIndex.value = 0
})

const anchorRef = ref<HTMLElement | null>(null)
const popoverRef = ref<HTMLElement | null>(null)
const popoverVisible = ref(false)
const popoverPosition = ref<{ top: number, left: number } | null>(null)
const popoverPlacement = ref<'bottom' | 'top'>('bottom')
const lastPopoverHeight = ref(0)
let showTimeout: ReturnType<typeof setTimeout> | null = null
let hideTimeout: ReturnType<typeof setTimeout> | null = null
let listenersAttached = false

const ENTER_DELAY_MS = 120
const LEAVE_DELAY_MS = 150

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
</script>

<template>
  <div
    v-if="showWidget"
    ref="anchorRef"
    class="steam-presence"
    @mouseenter="handleEnter"
    @mouseleave="handleLeave"
    @focusin="handleEnter"
    @focusout="handleLeave"
  >
    <slot name="trigger">
      <a
        v-if="props.steamId"
        :href="`https://steamcommunity.com/profiles/${props.steamId}`"
        target="_blank"
        rel="noopener noreferrer"
        class="steam-presence__link"
      >
        <Flex class="steam-presence__trigger" y-center gap="xs">
          <Icon v-if="isPlaying" class="activity-item__icon" name="mdi:steam" :width="props.iconSize" :height="props.iconSize" />
          <span v-if="isOnline && !props.hideOnlineIndicator" class="steam-presence__badge" />
        </Flex>
      </a>
      <Flex v-else class="steam-presence__trigger" y-center gap="xs">
        <Icon v-if="isPlaying" class="activity-item__icon" name="mdi:steam" :width="props.iconSize" :height="props.iconSize" />
        <span v-if="isOnline && !props.hideOnlineIndicator" class="steam-presence__badge" />
      </Flex>
    </slot>

    <Teleport to="body">
      <Transition name="steam-presence-fade">
        <div
          v-if="popoverVisible && popoverStyle"
          ref="popoverRef"
          class="steam-presence__popover"
          :class="`steam-presence__popover--${popoverPlacement}`"
          :style="popoverStyle"
          @mouseenter="handleEnter"
          @mouseleave="handleLeave"
          @focusin="handleEnter"
          @focusout="handleLeave"
        >
          <div class="steam-presence__tooltip">
            <Flex x-between y-center class="mb-s">
              <strong class="text-l text-bold">
                Steam
              </strong>
              <Button
                v-if="props.steamId"
                size="s"
                variant="link"
                :href="`https://steamcommunity.com/profiles/${props.steamId}`"
                target="_blank"
                rel="noopener noreferrer"
              >
                View profile
              </Button>
            </Flex>

            <div class="steam-presence__section">
              <div class="steam-presence__row">
                <span class="steam-presence__label">Steam ID</span>
                <span class="steam-presence__value">{{ props.steamId || 'Unknown' }}</span>
              </div>
              <div v-if="presenceRow?.steam_name" class="steam-presence__row">
                <span class="steam-presence__label">Name</span>
                <span class="steam-presence__value">{{ presenceRow.steam_name }}</span>
              </div>
              <div v-if="presenceRow?.status" class="steam-presence__row steam-presence__row--inline">
                <span class="steam-presence__label">Status</span>
                <Badge :variant="statusBadgeVariant" size="s">
                  {{ statusLabel }}
                </Badge>
              </div>
            </div>

            <Divider v-if="hasPresence && !props.richPresenceDisabled" class="m-xxs p-xxs" :margin="0" />

            <div v-if="hasPresence && !props.richPresenceDisabled" class="steam-presence__section">
              <a
                v-if="displayedAppId"
                class="steam-presence__row steam-presence__row--link"
                :href="`https://store.steampowered.com/app/${displayedAppId}`"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Flex y-center gap="s">
                  <img
                    v-if="gameIconUrl"
                    :key="gameIconUrl"
                    :src="gameIconUrl"
                    :alt="displayedAppName ? `${displayedAppName} icon` : 'Steam app icon'"
                    width="40"
                    height="40"
                    class="steam-presence__game-icon"
                    @error="onGameIconError"
                  >
                  <div class="steam-presence__game-text">
                    <div class="steam-presence__game-title">
                      <template v-if="isPlaying && displayedAppName">
                        Playing {{ displayedAppName }}
                      </template>
                      <template v-else-if="displayedAppName">
                        Last played {{ displayedAppName }}
                      </template>
                      <template v-else>
                        No recent game
                      </template>
                    </div>
                    <div v-if="lastOnlineFormatted" class="steam-presence__meta">
                      Last online {{ lastOnlineFormatted }}
                    </div>
                  </div>
                </Flex>
              </a>
              <div v-else class="steam-presence__row">
                <Flex y-center gap="s">
                  <img
                    v-if="gameIconUrl"
                    :key="gameIconUrl"
                    :src="gameIconUrl"
                    :alt="displayedAppName ? `${displayedAppName} icon` : 'Steam app icon'"
                    width="40"
                    height="40"
                    class="steam-presence__game-icon"
                    @error="onGameIconError"
                  >
                  <div class="steam-presence__game-text">
                    <div class="steam-presence__game-title">
                      <template v-if="isPlaying && displayedAppName">
                        Playing {{ displayedAppName }}
                      </template>
                      <template v-else-if="displayedAppName">
                        Last played {{ displayedAppName }}
                      </template>
                      <template v-else>
                        No recent game
                      </template>
                    </div>
                    <div v-if="lastOnlineFormatted" class="steam-presence__meta">
                      Last online {{ lastOnlineFormatted }}
                    </div>
                  </div>
                </Flex>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.steam-presence {
  width: 100%;
  display: inline-flex;
}

.steam-presence__link {
  display: inline-flex;
  color: inherit;
  text-decoration: none;
}

.steam-presence__trigger {
  cursor: pointer;
  color: var(--color-text);
  position: relative;
}

.steam-presence__trigger--accent {
  color: var(--color-accent);
}

.steam-presence__badge {
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

.steam-presence__popover {
  position: fixed;
  z-index: 9999;
  min-width: 320px;
  max-width: 420px;
  pointer-events: auto;
}

.steam-presence__popover--bottom {
  transform: translate(-50%, 0);
}

.steam-presence__popover--top {
  transform: translate(-50%, -100%);
}

.steam-presence-fade-enter-active,
.steam-presence-fade-leave-active {
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
}

.steam-presence-fade-enter-from,
.steam-presence-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -6px);
}

.steam-presence-fade-enter-to,
.steam-presence-fade-leave-from {
  opacity: 1;
  transform: translate(-50%, 0);
}

.steam-presence__popover--top.steam-presence-fade-enter-from,
.steam-presence__popover--top.steam-presence-fade-leave-to {
  transform: translate(-50%, calc(-100% - 6px));
}

.steam-presence__popover--top.steam-presence-fade-enter-to,
.steam-presence__popover--top.steam-presence-fade-leave-from {
  transform: translate(-50%, -100%);
}

.steam-presence__tooltip {
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

.steam-presence__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.steam-presence__row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--color-border-weak);
  border-radius: 10px;
  background: var(--color-bg-raised);
}

.steam-presence__row--link {
  color: inherit;
  text-decoration: none;
  cursor: pointer;
}

.steam-presence__row--inline {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.steam-presence__label {
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.02em;
  color: var(--color-text-light);
}

.steam-presence__value {
  font-size: var(--font-size-xs);
  font-family: var(--font-family-mono, monospace);
}

.steam-presence__game-icon {
  border-radius: var(--border-radius-s);
  object-fit: cover;
}

.steam-presence__game-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.steam-presence__game-title {
  font-size: var(--font-size-s);
  font-weight: 600;
}

.steam-presence__meta {
  font-size: 11px;
  color: var(--color-text-lighter);
}
</style>
