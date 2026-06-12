<script setup lang="ts">
import { Badge, Button, Divider, Flex, Popout } from '@dolanske/vui'
import { computed, ref } from 'vue'
import { displayDate } from '@/lib/utils/date'

// Local type until migration is applied and database.types.ts is regenerated
interface LastfmPresence {
  profile_id: string
  lastfm_username: string
  now_playing: boolean
  track_name: string | null
  artist_name: string | null
  album_name: string | null
  album_art_url: string | null
  track_url: string | null
  played_at: string | null
  updated_at: string
}

interface Props {
  lastfmUsername?: string | null
  presence?: LastfmPresence | null
  richPresenceEnabled?: boolean
  hideNowPlayingIndicator?: boolean
  iconSize?: number
}

const props = withDefaults(defineProps<Props>(), {
  presence: null,
  richPresenceEnabled: false,
  hideNowPlayingIndicator: false,
  iconSize: 18,
})

const showWidget = computed(() => Boolean(props.lastfmUsername || props.presence))
const hasPresence = computed(() => Boolean(props.presence))
const isNowPlaying = computed(() => props.presence?.now_playing === true)

const playedAtFormatted = computed(() => {
  const p = props.presence?.played_at
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

const lastfmProfileUrl = computed(() =>
  props.lastfmUsername ? `https://www.last.fm/user/${props.lastfmUsername}` : null,
)

const anchorRef = ref<HTMLElement | null>(null)
const visible = ref(false)
</script>

<template>
  <div
    v-if="showWidget"
    ref="anchorRef"
    class="rp-widget"
    @mouseenter="visible = true"
    @mouseleave="visible = false"
    @focusin="visible = true"
    @focusout="visible = false"
  >
    <slot name="trigger">
      <Flex class="rp-trigger" y-center gap="xs">
        <Icon
          name="simple-icons:lastdotfm"
          :width="props.iconSize"
          :height="props.iconSize"
        />
        <span v-if="isNowPlaying && !props.hideNowPlayingIndicator" class="rp-badge rp-badge--playing" />
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
      <div class="rp-tooltip">
        <Flex x-between y-center class="mb-s">
          <Flex y-center gap="xs">
            <strong class="text-l text-bold">Last.fm</strong>
            <Badge v-if="isNowPlaying" variant="success">
              Now Playing
            </Badge>
          </Flex>
          <Button
            v-if="lastfmProfileUrl"
            size="s"
            variant="link"
            :href="lastfmProfileUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="ph:arrow-square-out" />
          </Button>
        </Flex>

        <div v-if="hasPresence && props.presence" class="rp-section">
          <Flex gap="s" y-center>
            <a
              v-if="props.presence.album_art_url"
              :href="props.presence.track_url ?? undefined"
              target="_blank"
              rel="noopener noreferrer"
              class="rp-album-art-link"
            >
              <img
                :src="props.presence.album_art_url"
                :alt="props.presence.album_name ? `${props.presence.album_name} cover art` : 'Album cover art'"
                width="48"
                height="48"
                class="rp-album-art"
              >
            </a>
            <div class="rp-track-info">
              <a
                v-if="props.presence.track_url"
                :href="props.presence.track_url"
                target="_blank"
                rel="noopener noreferrer"
                class="rp-track-title"
              >
                {{ props.presence.track_name || 'Unknown track' }}
              </a>
              <span v-else class="rp-track-title">
                {{ props.presence.track_name || 'Unknown track' }}
              </span>
              <div v-if="props.presence.artist_name" class="rp-meta">
                {{ props.presence.artist_name }}
              </div>
              <div v-if="props.presence.album_name" class="rp-meta rp-meta--album">
                {{ props.presence.album_name }}
              </div>
            </div>
          </Flex>

          <Divider v-if="!isNowPlaying && playedAtFormatted" class="my-xs" />

          <div v-if="!isNowPlaying && playedAtFormatted" class="rp-row">
            <span class="rp-label">Last Scrobbled</span>
            <span class="rp-value">{{ playedAtFormatted }}</span>
          </div>
        </div>

        <div v-else-if="!richPresenceEnabled" class="rp-section">
          <p class="text-s text-color-lighter">
            Rich presence is disabled.
          </p>
        </div>

        <div v-else class="rp-section">
          <p class="text-s text-color-lighter">
            No recent scrobbles.
          </p>
        </div>
      </div>
    </Popout>
  </div>
</template>

<style scoped>
.rp-badge--playing {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: var(--border-radius-pill);
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

.rp-album-art-link {
  display: flex;
  flex-shrink: 0;
}

.rp-album-art {
  border-radius: var(--border-radius-s);
  object-fit: cover;
  flex-shrink: 0;
}

.rp-track-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}

.rp-track-title {
  font-size: var(--font-size-s);
  font-weight: 600;
  color: var(--color-text);
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &:hover {
    text-decoration: underline;
  }
}

.rp-meta {
  font-size: var(--font-size-xs);
  color: var(--color-text-lighter);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rp-meta--album {
  font-style: italic;
}
</style>
