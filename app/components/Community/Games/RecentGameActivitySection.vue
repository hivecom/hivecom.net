<script setup lang="ts">
import type { MetricsHistoryEntry } from '@/composables/useDataMetrics'
import type { NowPlayingEntry, PlayingEntry, RecentlyPlayedEntry } from '@/lib/games/recentActivity'
import type { Tables } from '@/types/database.overrides'
import { Button, Card, Flex, Grid, Skeleton } from '@dolanske/vui'
import { computed, ref } from 'vue'
import GameRecentlyPlayedSheet from '@/components/Community/Games/GameRecentlyPlayedSheet.vue'
import RecentGameActivityTile from '@/components/Community/Games/RecentGameActivityTile.vue'
import GlowCard from '@/components/Shared/GlowCard.vue'
import GlowGroup from '@/components/Shared/GlowGroup.vue'
import { buildNowPlaying, buildRecentlyPlayedMap } from '@/lib/games/recentActivity'
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

// Games with live players right now (auth-gated)
const nowPlaying = computed<NowPlayingEntry[]>(() =>
  buildNowPlaying(props.currentPlayersBySteamId, props.games, props.isLoggedIn).slice(0, 4),
)

// Set of game IDs already shown as live - used to avoid duplication
const liveGameIds = computed(() => new Set(nowPlaying.value.map(e => e.game.id)))

// Recently played games from metricsHistory (last ~14d), excluding live ones
// We pick the most recently active bucket per game and take top results
const recentlyPlayed = computed<RecentlyPlayedEntry[]>(() => {
  const history = props.metricsHistory
  if (!history?.length || !props.isLoggedIn)
    return []

  const byGameId = buildRecentlyPlayedMap(history)
  const entries: RecentlyPlayedEntry[] = []
  for (const [gameId, { lastSeen, peakCount }] of byGameId) {
    if (liveGameIds.value.has(gameId))
      continue

    const game = props.games.find(g => g.id === gameId)
    if (!game)
      continue

    entries.push({ game, playerIds: [], live: false, lastSeen, peakCount })
  }

  const slots = Math.max(0, 4 - nowPlaying.value.length)
  return entries.sort((a, b) => b.lastSeen - a.lastSeen).slice(0, slots)
})

const allEntries = computed<PlayingEntry[]>(() => [
  ...nowPlaying.value,
  ...recentlyPlayed.value,
])

const sectionTitle = computed(() => {
  if (!props.isLoggedIn)
    return null
  if (allEntries.value.length === 0)
    return null

  return 'Most Recently Played'
})

const sheetOpen = ref(false)
</script>

<template>
  <!-- Sign-in CTA for unauthenticated users -->
  <template v-if="!isLoggedIn">
    <Card class="recent-game-activity-signin">
      <Flex column gap="l" y-center class="recent-game-activity-signin__content">
        <div class="recent-game-activity-signin__icon">
          <Icon name="ph:game-controller" size="5rem" />
        </div>
        <h3 class="text-bold text-xxl">
          See Who's Playing
        </h3>
        <p class="text-color-light text-center">
          Sign in to see which games are being played right now
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

  <!-- Loading skeleton. Mirrors the header row and the tile grid below so
       nothing jumps once the data lands. -->
  <template v-else-if="loading">
    <Flex y-center x-between gap="s" class="mb-s">
      <Skeleton :height="14" :width="160" :radius="4" />
      <Skeleton :height="26" :width="96" :radius="6" />
    </Flex>

    <Grid :columns="isMobile ? 1 : 4" gap="m">
      <Card v-for="i in 4" :key="i">
        <Flex column gap="xs">
          <Flex y-center gap="xs">
            <Skeleton :height="24" :width="24" :radius="6" />
            <Skeleton :height="14" :width="`${50 + ((i * 17) % 35)}%`" :radius="4" />
          </Flex>
          <Skeleton :height="10" :width="`${40 + ((i * 11) % 30)}%`" :radius="4" />
        </Flex>
      </Card>
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
      <Button size="s" outline @click="sheetOpen = true">
        View All
        <template #end>
          <Icon name="ph:caret-up-down" />
        </template>
      </Button>
    </Flex>

    <GameRecentlyPlayedSheet
      :open="sheetOpen"
      :games="games"
      :current-players-by-steam-id="currentPlayersBySteamId"
      :is-logged-in="isLoggedIn"
      :metrics-history="metricsHistory"
      @close="sheetOpen = false"
    />

    <GlowGroup>
      <Grid :columns="isMobile ? 1 : 4" gap="m">
        <GlowCard v-for="entry in allEntries" :key="entry.game.id">
          <RecentGameActivityTile
            :game="entry.game"
            :live="entry.live"
            :player-ids="entry.playerIds"
            :last-seen="entry.live ? undefined : entry.lastSeen"
            :peak-count="entry.live ? undefined : entry.peakCount"
          />
        </GlowCard>
      </Grid>
    </GlowGroup>
  </template>
</template>

<style lang="scss" scoped>
// Sign-in Prompt
.recent-game-activity-signin {
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
</style>
