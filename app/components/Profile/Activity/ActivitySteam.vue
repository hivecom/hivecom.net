<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Flex, Tooltip } from '@dolanske/vui'
import RichPresenceSteam from '@/components/Profile/RichPresenceSteam.vue'

type SteamPresence = Omit<Tables<'presences_steam'>, 'details'> & {
  details?: unknown | null
}

interface Props {
  profileId: string
  steamId?: string | null
  isOwnProfile?: boolean
}

const props = defineProps<Props>()

const supabase = useSupabaseClient()

// Auto-refresh interval (1 minute)
const REFRESH_INTERVAL_MS = 60 * 1000

const presence = ref<SteamPresence | null>(null)
const loading = ref(true)
const refreshing = ref(false)
let refreshTimer: ReturnType<typeof setInterval> | null = null

// Fetch presence data
async function fetchPresence() {
  try {
    const { data, error } = await supabase
      .from('presences_steam')
      .select('*')
      .eq('profile_id', props.profileId)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching Steam presence:', error)
    }

    presence.value = data
  }
  catch (err) {
    console.error('Error fetching Steam presence:', err)
  }
  finally {
    loading.value = false
  }
}

// Format the status for display
const statusLabel = computed(() => {
  if (!presence.value?.status)
    return null

  const statusMap: Record<string, string> = {
    offline: 'Offline',
    online: 'Online',
    busy: 'Busy',
    away: 'Away',
    snooze: 'Snooze',
    looking_to_trade: 'Looking to Trade',
    looking_to_play: 'Looking to Play',
  }

  return statusMap[presence.value.status] || presence.value.status
})

// Status color for the indicator
const statusColor = computed(() => {
  if (!presence.value?.status)
    return 'var(--color-text-lighter)'

  const colorMap: Record<string, string> = {
    offline: 'var(--color-text-lighter)',
    online: 'var(--color-text-green)',
    busy: 'var(--color-text-red)',
    away: 'var(--color-text-yellow)',
    snooze: 'var(--color-text-yellow)',
    looking_to_trade: 'var(--color-text-green)',
    looking_to_play: 'var(--color-text-green)',
  }

  return colorMap[presence.value.status] || 'var(--color-text-lighter)'
})

// Check if currently playing a game
const isPlaying = computed(() => {
  return presence.value?.status
    && presence.value?.status !== 'offline'
    && presence.value?.current_app_id
    && presence.value?.current_app_name
})

const currentAppUrl = computed(() => {
  if (!presence.value?.current_app_id)
    return null

  return `https://store.steampowered.com/app/${presence.value.current_app_id}`
})

const gameIconIndex = ref(0)

const gameIconSources = computed(() => {
  if (!presence.value?.current_app_id)
    return []

  const appId = presence.value.current_app_id
  const sources: string[] = []

  const details = presence.value.details as unknown
  const getDetailString = (key: 'game_icon_url' | 'game_icon' | 'game_icon_hash') => {
    if (!details || typeof details !== 'object' || Array.isArray(details))
      return null

    const record = details as { [key: string]: unknown }
    const value = record[key]

    return typeof value === 'string' ? value : null
  }

  const iconUrl = getDetailString('game_icon_url')
  const iconHash = getDetailString('game_icon') || getDetailString('game_icon_hash')

  if (iconUrl)
    sources.push(iconUrl)
  if (iconHash)
    sources.push(`https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${appId}/${iconHash}.jpg`)

  sources.push(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/capsule_sm_120.jpg`)
  sources.push(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`)

  return sources
})

// Get game icon URL from Steam CDN (with fallbacks)
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

watch(() => presence.value?.current_app_id, () => {
  gameIconIndex.value = 0
})

// Request a refresh of Steam data (called automatically)
async function refreshSteamData() {
  if (refreshing.value || !props.isOwnProfile)
    return

  refreshing.value = true

  try {
    const { error } = await supabase.functions.invoke('presence-refresh-steam')

    if (error) {
      console.error('Error refreshing Steam data:', error)
      return
    }

    // Wait a moment for the background job to complete, then refetch
    await new Promise(resolve => setTimeout(resolve, 2000))
    await fetchPresence()
  }
  catch (err) {
    console.error('Error refreshing Steam data:', err)
  }
  finally {
    refreshing.value = false
  }
}

// Format last online time
const lastOnlineFormatted = computed(() => {
  if (!presence.value?.last_online_at)
    return null

  const date = new Date(presence.value.last_online_at)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1)
    return 'Just now'
  if (diffMins < 60)
    return `${diffMins}m ago`
  if (diffHours < 24)
    return `${diffHours}h ago`
  if (diffDays < 7)
    return `${diffDays}d ago`

  return date.toLocaleDateString()
})

// Start auto-refresh timer
function startAutoRefresh() {
  stopAutoRefresh()
  if (props.isOwnProfile) {
    refreshTimer = setInterval(() => {
      refreshSteamData()
    }, REFRESH_INTERVAL_MS)
  }
}

// Stop auto-refresh timer
function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

// Auto-refresh on mount (only for own profile)
onMounted(async () => {
  await fetchPresence()

  // If it's the user's own profile, trigger an immediate refresh and start timer
  if (props.isOwnProfile) {
    refreshSteamData()
    startAutoRefresh()
  }
})

// Cleanup on unmount
onUnmounted(() => {
  stopAutoRefresh()
})

// Watch for profile changes
watch(() => props.profileId, () => {
  loading.value = true
  presence.value = null
  stopAutoRefresh()
  fetchPresence()

  if (props.isOwnProfile) {
    refreshSteamData()
    startAutoRefresh()
  }
})
</script>

<template>
  <RichPresenceSteam :steam-id="steamId" :presence="presence" class="w-100">
    <template #trigger>
      <div class="activity-item">
        <Flex expand y-center x-between gap="s">
          <!-- Loading state -->
          <template v-if="loading">
            <div>
              <span class="activity-item__label">
                <Icon class="activity-item__icon" name="mdi:steam" size="13" />
                Loading...
              </span>
              <strong class="activity-item__title">—</strong>
            </div>
          </template>

          <!-- Has presence data -->
          <template v-else-if="presence">
            <div>
              <span class="activity-item__label">
                <Icon class="activity-item__icon" name="mdi:steam" size="13" />
                Steam
              </span>
              <strong class="activity-item__title">
                <Tooltip v-if="!isPlaying && presence.status === 'offline' && lastOnlineFormatted" position="top">
                  <template #tooltip>
                    Last online {{ lastOnlineFormatted }}
                  </template>
                  <span
                    class="activity-item__status-dot"
                    :style="{ backgroundColor: statusColor }"
                  />
                </Tooltip>
                <span
                  v-else
                  class="activity-item__status-dot"
                  :style="{ backgroundColor: statusColor }"
                />
                <template v-if="isPlaying">
                  <a
                    v-if="currentAppUrl"
                    :href="currentAppUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Playing {{ presence.current_app_name }}
                  </a>
                  <span v-else>Playing {{ presence.current_app_name }}</span>
                </template>
                <template v-else-if="statusLabel">{{ statusLabel }}</template>
                <template v-else-if="presence.steam_name">{{ presence.steam_name }}</template>
                <template v-else>Unknown</template>
              </strong>
            </div>

            <!-- Right side: game icon -->
            <img
              v-if="isPlaying && gameIconUrl"
              :key="gameIconUrl"
              :src="gameIconUrl"
              :alt="`${presence.current_app_name} icon`"
              width="32"
              height="32"
              class="activity-item__game-icon"
              @error="onGameIconError"
            >
          </template>

          <!-- No presence data -->
          <template v-else>
            <div>
              <span class="activity-item__label">
                <Icon class="activity-item__icon" name="mdi:steam" size="13" />
                Steam
              </span>
              <strong class="activity-item__title">No recent activity</strong>
            </div>
          </template>
        </Flex>
      </div>
    </template>
  </RichPresenceSteam>
</template>

<style lang="scss" scoped>
.activity-item {
  width: 100%;
}
.activity-item__status-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.activity-item__game-icon {
  border-radius: var(--border-radius-s);
  object-fit: cover;
}

.activity-item__title {
  font-size: var(--font-size-s);
}
</style>
