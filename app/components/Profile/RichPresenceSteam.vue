<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Badge, Button, Divider, Flex, Popout } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'

type SteamPresence = Omit<Tables<'presences_steam'>, 'details'> & {
  details?: unknown | null
}

interface Props {
  steamId?: string | null
  presence?: SteamPresence | null
  richPresenceEnabled?: boolean
  hideOnlineIndicator?: boolean
  iconSize?: number
  useAccentColor?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  presence: null,
  richPresenceEnabled: false,
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
const visible = ref(false)
</script>

<template>
  <div
    v-if="showWidget"
    ref="anchorRef"
    class="steam-presence"
    @mouseenter="visible = true"
    @mouseleave="visible = false"
    @focusin="visible = true"
    @focusout="visible = false"
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

    <Popout
      :anchor="anchorRef"
      :visible="visible"
      placement="bottom"
      :offset="8"
      :enter-delay="120"
      :leave-delay="150"
      @mouseenter="visible = true"
      @mouseleave="visible = false"
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
            <Icon name="mdi:open-in-new" />
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

        <Divider v-if="hasPresence && props.richPresenceEnabled" class="m-xxs p-xxs" :margin="0" />

        <div v-if="hasPresence && props.richPresenceEnabled" class="steam-presence__section">
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
    </Popout>
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

.steam-presence__tooltip {
  width: 328px;
  display: flex;
  flex-direction: column;
  padding: var(--space-m);
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
  border: 1px solid var(--color-border);
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
