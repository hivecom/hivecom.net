<script setup lang="ts">
import type { MetricsHistoryEntry } from '@/composables/useDataMetrics'
import type { Tables } from '@/types/database.overrides'
import { Card, Flex, Grid, Indicator, Skeleton, Tooltip } from '@dolanske/vui'
import { computed } from 'vue'
import BulkAvatarDisplay from '@/components/Shared/BulkAvatarDisplay.vue'
import GameDetailsModalTrigger from '@/components/Shared/GameDetailsModalTrigger.vue'
import GameIcon from '@/components/Shared/GameIcon.vue'
import GlowCard from '@/components/Shared/GlowCard.vue'
import GlowGroup from '@/components/Shared/GlowGroup.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{
  // Map of steam_id (number) -> array of profile_ids currently playing
  currentPlayersBySteamId: Map<number, string[]>
  // Full games list to cross-reference steam_id -> game
  games: Tables<'games'>[]
  // Whether the current user is authenticated
  isLoggedIn: boolean
  // Whether the presences data is still loading
  loading: boolean
  // Metrics history buckets for "recently played" fallback
  metricsHistory?: MetricsHistoryEntry[]
}>()

const isMobile = useBreakpoint('<s')

interface NowPlayingEntry {
  game: Tables<'games'>
  playerIds: string[]
  live: true
}

interface RecentlyPlayedEntry {
  game: Tables<'games'>
  playerIds: string[]
  live: false
  lastSeen: number
}

type PlayingEntry = NowPlayingEntry | RecentlyPlayedEntry

// Games with live players right now (auth-gated)
const nowPlaying = computed<NowPlayingEntry[]>(() => {
  if (!props.isLoggedIn)
    return []

  const entries: NowPlayingEntry[] = []
  for (const [steamId, playerIds] of props.currentPlayersBySteamId) {
    const game = props.games.find(g => g.steam_id === steamId)
    if (game)
      entries.push({ game, playerIds, live: true })
  }
  return entries.sort((a, b) => b.playerIds.length - a.playerIds.length).slice(0, 8)
})

// Set of game IDs already shown as live - used to avoid duplication
const liveGameIds = computed(() => new Set(nowPlaying.value.map(e => e.game.id)))

// Recently played games from metricsHistory (last ~14d), excluding live ones
// We pick the most recently active bucket per game and take top results
const recentlyPlayed = computed<RecentlyPlayedEntry[]>(() => {
  const history = props.metricsHistory
  if (!history?.length || !props.isLoggedIn)
    return []

  const latestByGameId = new Map<number, number>()
  const sortedHistory = [...history].sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime())

  for (const entry of sortedHistory) {
    if (!entry.usersByGame)
      continue
    const capturedAt = new Date(entry.capturedAt).getTime()
    for (const [idStr, count] of Object.entries(entry.usersByGame)) {
      if (!count || count < 1)
        continue
      const id = Number(idStr)
      if (Number.isNaN(id))
        continue
      const existing = latestByGameId.get(id)
      if (existing === undefined || capturedAt > existing)
        latestByGameId.set(id, capturedAt)
    }
  }

  const entries: RecentlyPlayedEntry[] = []
  for (const [gameId, lastSeen] of latestByGameId) {
    if (liveGameIds.value.has(gameId))
      continue
    const game = props.games.find(g => g.id === gameId)
    if (!game)
      continue
    entries.push({ game, playerIds: [], live: false, lastSeen })
  }

  const liveCount = nowPlaying.value.length
  const slots = liveCount === 0 ? 4 : Math.max(0, 8 - liveCount)
  return entries.sort((a, b) => b.lastSeen - a.lastSeen).slice(0, slots)
})

const allEntries = computed<PlayingEntry[]>(() => [
  ...nowPlaying.value,
  ...recentlyPlayed.value,
])

const sectionTitle = computed(() => {
  if (!props.isLoggedIn)
    return null
  const liveCount = nowPlaying.value.length
  if (liveCount > 0)
    return 'Playing Now'
  if (recentlyPlayed.value.length > 0)
    return 'Most recently played'
  return null
})
</script>

<template>
  <!-- Sign-in CTA for unauthenticated users -->
  <template v-if="!isLoggedIn">
    <Card class="signin-prompt">
      <Flex column gap="l" y-center class="signin-prompt__content">
        <div class="signin-prompt__icon">
          <Icon name="ph:game-controller" size="5rem" />
        </div>
        <h3 class="text-bold text-xxl">
          See Who's Playing
        </h3>
        <p class="text-color-light text-center">
          Sign in to see which games community members are playing right now
        </p>
        <NuxtLink to="/auth/sign-in">
          <Button variant="accent">
            <template #start>
              <Icon name="ph:sign-in" />
            </template>
            Sign In
          </Button>
        </NuxtLink>
      </Flex>
    </Card>
  </template>

  <!-- Loading skeleton -->
  <template v-else-if="loading">
    <Grid :columns="isMobile ? 2 : 4" gap="m">
      <Skeleton v-for="i in 4" :key="i" :height="100" :radius="8" />
    </Grid>
  </template>

  <!-- Empty state: no live players and no recent history -->
  <template v-else-if="allEntries.length === 0">
    <p class="text-s text-color-lighter">
      No recent game activity to show.
    </p>
  </template>

  <!-- Tiles -->
  <template v-else>
    <Flex y-center x-between gap="s" class="mb-s">
      <h3 v-if="sectionTitle" class="section-title">
        {{ sectionTitle }}
      </h3>
    </Flex>
    <GlowGroup>
      <Grid :columns="isMobile ? 2 : 4" gap="m">
        <GameDetailsModalTrigger
          v-for="entry in allEntries"
          :key="entry.game.id"
          v-slot="{ open }"
          :game-id="entry.game.id"
        >
          <GlowCard>
            <Card class="now-playing-tile" @click="open">
              <Flex column gap="s" class="now-playing-tile__inner">
                <!-- Status row -->
                <Flex v-if="entry.live" y-center gap="xs">
                  <Tooltip placement="top">
                    <Indicator variant="online" outline ripple />
                    <template #tooltip>
                      <p>Playing right now</p>
                    </template>
                  </Tooltip>
                  <span class="text-xs text-bold text-color-lighter">
                    {{ entry.playerIds.length === 1 ? '1 playing' : `${entry.playerIds.length} playing` }}
                  </span>
                </Flex>

                <!-- Game name row -->
                <Flex y-center gap="xs">
                  <GameIcon :game="entry.game" size="s" />
                  <span class="text-s text-bold now-playing-tile__name">{{ entry.game.name }}</span>
                </Flex>

                <!-- Avatars for live entries only -->
                <BulkAvatarDisplay
                  v-if="entry.live && entry.playerIds.length > 0"
                  :user-ids="entry.playerIds"
                  :max-users="5"
                  :avatar-size="16"
                  :gap="-5"
                  :show-names="false"
                  cluster
                  no-empty-state
                />
              </Flex>
            </Card>
          </GlowCard>
        </GameDetailsModalTrigger>
      </Grid>
    </GlowGroup>
  </template>
</template>

<style lang="scss" scoped>
// Sign-in Prompt
.signin-prompt {
  min-height: 200px;
  border: 2px dashed var(--color-border);
  text-align: center;

  &__content {
    padding: var(--space-xl);
  }

  &__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 80px;
    height: 80px;
    border-radius: var(--border-radius-pill);
    background: linear-gradient(135deg, var(--color-accent-weak), var(--color-accent-alpha));
    color: var(--color-accent);
    margin: 0 auto;
  }
}

// Section heading
.section-title {
  margin: 0;
  font-size: var(--font-size-s);
  color: var(--color-text-light);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

// Now Playing Tiles
.now-playing-tile {
  cursor: pointer;
  height: 100%;
  position: relative;

  :deep(.vui-card-content) {
    height: 100%;
  }
}

.now-playing-tile__inner {
  height: 100%;
}

.now-playing-tile__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
</style>
