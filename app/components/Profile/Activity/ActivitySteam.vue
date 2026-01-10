<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Flex, Tooltip } from '@dolanske/vui'

type SteamPresence = Tables<'presences_steam'>

interface Props {
  profileId: string
  steamId?: string | null
  isOwnProfile?: boolean
}

const props = defineProps<Props>()

// Steam profile URL
const steamProfileUrl = computed(() => {
  if (!props.steamId)
    return null
  return `https://steamcommunity.com/profiles/${props.steamId}`
})

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
  return presence.value?.last_app_id && presence.value?.last_app_name
})

// Get game icon URL from Steam CDN
const gameIconUrl = computed(() => {
  if (!presence.value?.last_app_id)
    return null

  // Steam CDN URL for game icons
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${presence.value.last_app_id}/capsule_sm_120.jpg`
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
  <div class="activity-item">
    <Flex y-center x-between gap="s">
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
            <Tooltip v-if="steamProfileUrl" position="top">
              <template #tooltip>
                Steam ID: {{ steamId }}
              </template>
              <a
                :href="steamProfileUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="activity-item__steam-link"
              >
                <Icon class="activity-item__icon" name="mdi:steam" size="13" />
              </a>
            </Tooltip>
            <Icon v-else class="activity-item__icon" name="mdi:steam" size="13" />
            <template v-if="isPlaying">Playing</template>
            <template v-else>Steam</template>
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
            <template v-if="isPlaying">{{ presence.last_app_name }}</template>
            <template v-else-if="presence.steam_name">{{ presence.steam_name }}</template>
            <template v-else>{{ statusLabel }}</template>
          </strong>
        </div>

        <!-- Right side: game icon -->
        <img
          v-if="isPlaying && gameIconUrl"
          :src="gameIconUrl"
          :alt="`${presence.last_app_name} icon`"
          width="32"
          height="32"
          class="activity-item__game-icon"
        >
      </template>

      <!-- No presence data -->
      <template v-else>
        <div>
          <span class="activity-item__label">
            <Tooltip v-if="steamProfileUrl" position="top">
              <a
                :href="steamProfileUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="activity-item__steam-link"
              >
                <Icon class="activity-item__icon" name="mdi:steam" size="13" />
              </a>
              <template #tooltip>
                Steam ID: {{ steamId }}
              </template>
            </Tooltip>
            <Icon v-else class="activity-item__icon" name="mdi:steam" size="13" />
            Steam
          </span>
          <strong class="activity-item__title">No recent activity</strong>
        </div>
      </template>
    </Flex>
  </div>
</template>

<style lang="scss" scoped>
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

.activity-item__steam-link {
  display: inline-flex;
  align-items: center;
  color: inherit;
  text-decoration: none;
  cursor: pointer;

  &:hover {
    color: var(--color-accent);
  }
}
</style>
