<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Flex, Tooltip } from '@dolanske/vui'
import RichPresenceLastfm from '@/components/Profile/RichPresenceLastfm.vue'
import { useCachedFetch } from '@/composables/useCache'
import { displayDate } from '@/lib/utils/date'

interface Props {
  profileId: string
  lastfmUsername?: string | null
  richPresenceEnabled?: boolean
  isOwnProfile?: boolean
}

const props = defineProps<Props>()

const supabase = useSupabaseClient()

const REFRESH_INTERVAL_MS = 60 * 1000
const PRESENCE_TTL_MS = 60 * 1000

const {
  data: presence,
  initialLoading,
  refetch: refetchPresence,
} = useCachedFetch<Tables<'presences_lastfm'>>(
  () => ({
    table: 'presences_lastfm',
    select: '*',
    filters: { profile_id: props.profileId },
    single: true,
  }),
  { ttl: PRESENCE_TTL_MS },
)

const refreshing = ref(false)
let refreshTimer: ReturnType<typeof setInterval> | null = null

const isNowPlaying = computed(() => presence.value?.now_playing === true)

const albumArtReady = ref(false)
const albumArtRef = ref<HTMLImageElement | null>(null)

function handleAlbumArtLoad() {
  albumArtReady.value = true
}

// Handle cached images: if the browser already has the asset, the @load event
// may fire before Vue attaches the listener. Check `complete` after DOM updates.
async function syncAlbumArtReady() {
  albumArtReady.value = false
  await nextTick()
  const el = albumArtRef.value
  if (el && el.complete && el.naturalWidth > 0)
    albumArtReady.value = true
}

watch(() => presence.value?.album_art_url, () => {
  void syncAlbumArtReady()
})

const playedAtFormatted = computed(() => {
  const p = presence.value?.played_at
  if (!p)
    return null

  const date = new Date(p)
  if (Number.isNaN(date.getTime()))
    return null

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

  return displayDate(date)
})

async function refreshLastfmData() {
  if (refreshing.value || !props.isOwnProfile)
    return

  refreshing.value = true

  try {
    const { error } = await supabase.functions.invoke('presence-refresh-lastfm')

    if (error) {
      console.error('Error refreshing Last.fm data:', error)
      return
    }

    await new Promise(resolve => setTimeout(resolve, 2000))
    await refetchPresence()
  }
  catch (err) {
    console.error('Error refreshing Last.fm data:', err)
  }
  finally {
    refreshing.value = false
  }
}

function startAutoRefresh() {
  stopAutoRefresh()
  if (props.isOwnProfile) {
    refreshTimer = setInterval(() => {
      void refreshLastfmData()
    }, REFRESH_INTERVAL_MS)
  }
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

onMounted(() => {
  if (props.isOwnProfile) {
    void refreshLastfmData()
    startAutoRefresh()
  }
})

onUnmounted(() => {
  stopAutoRefresh()
})

watch(() => props.profileId, () => {
  stopAutoRefresh()
  void refetchPresence()

  if (props.isOwnProfile) {
    void refreshLastfmData()
    startAutoRefresh()
  }
})
</script>

<template>
  <RichPresenceLastfm
    :lastfm-username="lastfmUsername"
    :presence="presence"
    :rich-presence-enabled="richPresenceEnabled"
    class="w-100"
  >
    <template #trigger>
      <div class="activity-item">
        <Flex expand y-center x-between gap="s">
          <!-- Only before the first result, so a background refresh doesn't blank
               a row we already have data for -->
          <template v-if="initialLoading">
            <div>
              <span class="activity-item__label">
                <Icon class="activity-item__icon" name="simple-icons:lastdotfm" size="13" />
                Loading...
              </span>
              <strong class="activity-item__title">-</strong>
            </div>
          </template>

          <template v-else-if="presence">
            <div class="activity-item__text">
              <span class="activity-item__label">
                <Icon class="activity-item__icon" name="simple-icons:lastdotfm" size="13" />
                Last.fm
                <Tooltip :disabled="!(!isNowPlaying && playedAtFormatted)" position="top">
                  <template #tooltip>
                    Last scrobbled {{ playedAtFormatted }}
                  </template>
                  <span
                    class="activity-item__status-dot"
                    :class="{ 'activity-item__status-dot--playing': isNowPlaying }"
                  />
                </Tooltip>
              </span>
              <strong class="activity-item__title">
                <template v-if="isNowPlaying">
                  <a
                    v-if="presence.track_url"
                    :href="presence.track_url"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {{ presence.track_name || 'Unknown track' }}
                  </a>
                  <span v-else>{{ presence.track_name || 'Unknown track' }}</span>
                  <span v-if="presence.artist_name" class="activity-item__title-meta">- {{ presence.artist_name }}</span>
                </template>
                <template v-else-if="presence.track_name">
                  {{ presence.track_name }}
                  <span v-if="presence.artist_name" class="activity-item__title-meta">- {{ presence.artist_name }}</span>
                </template>
                <template v-else>
                  No recent scrobbles
                </template>
              </strong>
            </div>

            <a
              v-if="presence.album_art_url"
              :href="presence.track_url ?? undefined"
              target="_blank"
              rel="noopener noreferrer"
              class="activity-item__art-link"
            >
              <img
                ref="albumArtRef"
                :src="presence.album_art_url"
                :alt="presence.album_name ? `${presence.album_name} cover` : 'Album art'"
                width="32"
                height="32"
                loading="lazy"
                class="activity-item__art"
                :class="{ 'activity-item__art--ready': albumArtReady }"
                @load="handleAlbumArtLoad"
              >
            </a>
          </template>

          <template v-else>
            <div>
              <span class="activity-item__label">
                <Icon class="activity-item__icon" name="simple-icons:lastdotfm" size="13" />
                Last.fm
              </span>
              <strong class="activity-item__title">No recent scrobbles</strong>
            </div>
          </template>
        </Flex>
      </div>
    </template>
  </RichPresenceLastfm>
</template>

<style lang="scss" scoped>
.activity-item {
  width: 100%;
}

.activity-item__text {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.activity-item__title-meta {
  font-weight: normal;
  color: var(--color-text-lighter);
}

.activity-item__status-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: var(--border-radius-pill);
  background-color: var(--color-text-lighter);
}

.activity-item__status-dot--playing {
  background-color: var(--color-text-green);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.activity-item__art-link {
  display: flex;
  flex-shrink: 0;
}

.activity-item__art {
  width: 32px;
  height: 32px;
  border-radius: var(--border-radius-s);
  background: var(--color-bg-raised);
  object-fit: cover;
  opacity: 0;
  transition: opacity var(--transition-slow);

  &--ready {
    opacity: 1;
  }
}

.activity-item__title {
  font-size: var(--font-size-s);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
