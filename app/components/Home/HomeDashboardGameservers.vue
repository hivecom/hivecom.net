<script setup lang="ts">
import type { GameserverWithContainer } from '@/composables/useDataGameservers'
import type { MetricsHistoryEntry } from '@/composables/useDataMetrics'
import type { Tables } from '@/types/database.overrides'
import { Button, Flex, Skeleton } from '@dolanske/vui'
import { defineAsyncComponent } from 'vue'
import GameServerConnectButton from '@/components/GameServers/GameServerConnectButton.vue'
import HomeDashboardCardHeader from '@/components/Home/HomeDashboardCardHeader.vue'
import HomeDashboardEmpty from '@/components/Home/HomeDashboardEmpty.vue'
import HomeDashboardGameserverItem from '@/components/Home/HomeDashboardGameserverItem.vue'
import HomeDashboardPlaceholder from '@/components/Home/HomeDashboardPlaceholder.vue'
import HomeDashboardSection from '@/components/Home/HomeDashboardSection.vue'
import HomeDashboardSkeleton from '@/components/Home/HomeDashboardSkeleton.vue'
import GameArtCard from '@/components/Shared/GameArtCard.vue'
import OnlineBadge from '@/components/Shared/OnlineBadge.vue'
import { useDataGames } from '@/composables/useDataGames'
import { useDataGameservers } from '@/composables/useDataGameservers'
import { useDataMetrics } from '@/composables/useDataMetrics'
import { buildConnectContext } from '@/composables/useGameConnect'
import { isNil } from '@/lib/utils/common'
import { fromNow } from '@/lib/utils/date'
import { metricsPlayerCount } from '@/types/metrics'

const ChartGameserversPlayers = defineAsyncComponent(() => import('@/components/Shared/Charts/ChartGameserversPlayers.vue'))
const ChartActivityHistogramModal = defineAsyncComponent(() => import('@/components/Shared/Charts/ChartActivityHistogramModal.vue'))

// Gameservers card: the two busiest servers as artwork, then one server per
// game for everything else we host, then a single random pick to hop into. The
// tiles answer "is anyone on right now", which is the only reason to sort by
// activity at all. The rows are deliberately one-per-game: ranked by activity
// alone a weekend of Cobalt takes half the card, so a newcomer never finds out
// what else is running and a regular only sees what he already played.

const activityModalOpen = ref(false)

const SHOWN_LIVE = 2
const SHOWN_SELECTION = 3

interface ServerEntry {
  gs: GameserverWithContainer
  game: Tables<'games'> | null
  players: number
  /** Most recent point in the last 90 days where this server had anyone on it. */
  lastActive: { players: number, at: string } | null
}

const { gameservers, loading: gameserversLoading } = useDataGameservers()
const { getById: getGameById } = useDataGames()
const { metrics, fetchMetrics, fetchMetricsHistoryIsolated, getCachedHistory } = useDataMetrics()

// Two windows, because one can't do both jobs. The 90d pass buckets by day, so
// it reaches back far enough that a server nobody has touched in weeks still
// says when it last had someone on it. The 24h pass buckets by 15 minutes and
// overwrites it, so anything recent is accurate to the quarter hour instead of
// rounding out to "a day ago". Both are smaller than a single 30d fetch.
const cachedCoarse = getCachedHistory('90d')
const cachedFine = getCachedHistory('24h')

const coarseHistory = ref<MetricsHistoryEntry[]>(cachedCoarse ?? [])
const fineHistory = ref<MetricsHistoryEntry[]>(cachedFine ?? [])

// The snapshot decides who is busiest and the two history windows decide who
// was busiest last, so all three feed the sort. Painting as soon as the first
// one lands leaves the rows to reshuffle a beat later when the rest arrive.
// Warm caches satisfy this during setup, which is why the refs seed
// synchronously: the fetchers are async even on a warm cache, and that one
// render is the difference between a returning visitor seeing the card and
// seeing skeletons.
const ready = ref(metrics.value !== null && cachedCoarse !== null && cachedFine !== null)

// Rolled once at setup so the pick holds still: re-rolling per render would
// reshuffle it every time a snapshot lands, and rolling on mount would make it
// jump one tick after a warm cache has already painted a choice.
const rollSeed = Math.floor(Math.random() * 100000)

onMounted(async () => {
  // fetchMetrics rethrows on failure, and a dead snapshot still shouldn't leave
  // the card stuck on skeletons, so it's swallowed rather than rejecting the
  // batch.
  const [, coarse, fine] = await Promise.all([
    fetchMetrics().catch(() => null),
    fetchMetricsHistoryIsolated('90d'),
    fetchMetricsHistoryIsolated('24h'),
  ])

  coarseHistory.value = coarse
  fineHistory.value = fine
  ready.value = true
})

// Buckets come back oldest first and each bucket holds that window's peak, so
// the last write per server wins and the map ends up holding each server's most
// recent reading that had anyone on it.
const lastActiveByServer = computed(() => {
  const found = new Map<string, { players: number, at: string }>()

  for (const entry of [...coarseHistory.value, ...fineHistory.value]) {
    if (!entry.gameserversByServer)
      continue

    for (const [id, players] of Object.entries(entry.gameserversByServer)) {
      if (players > 0)
        found.set(id, { players, at: entry.capturedAt })
    }
  }

  return found
})

// Every server is a candidate, including ones no metrics run has ever seen. The
// rows are about what we host rather than what moved this week, and
// activityLabel already says `quiet lately` for a server with no reading.
const entries = computed<ServerEntry[]>(() =>
  gameservers.value.map((gs) => {
    const players = metricsPlayerCount(metrics.value?.gameservers.byServer[String(gs.id)])

    return {
      gs,
      game: isNil(gs.game) ? null : getGameById(gs.game),
      players: players ?? 0,
      lastActive: lastActiveByServer.value.get(String(gs.id)) ?? null,
    }
  }),
)

// Busiest now, then most recently busy, then alphabetical so the tail is stable
// rather than reshuffling on every snapshot.
const ranked = computed(() =>
  [...entries.value].sort((a, b) => {
    if (a.players !== b.players)
      return b.players - a.players

    const aAt = a.lastActive ? Date.parse(a.lastActive.at) : 0
    const bAt = b.lastActive ? Date.parse(b.lastActive.at) : 0
    if (aAt !== bAt)
      return bAt - aAt

    return a.gs.name.localeCompare(b.gs.name)
  }),
)

// The tiles are the top of the ranking whether or not anyone is on. With an
// empty snapshot that falls through to whoever was busy most recently, which
// beats two empty cells.
const live = computed(() => ranked.value.slice(0, SHOWN_LIVE))

// Nobody on means the tiles are showing the last people who were, so the label
// follows instead of claiming a live server that isn't.
const liveLabel = computed(() =>
  live.value.some(entry => entry.players > 0) ? 'Live right now' : 'Where people played last',
)

interface GameGroup {
  /** Game id, or the server's own id when it isn't tied to a game. */
  key: string
  name: string
  servers: ServerEntry[]
  /** Most recent activity anywhere in the group, for ordering the groups. */
  lastActiveAt: number
}

// One server per game, games ordered by how many of them we run and then by how
// recently anyone was in one. A game already on a tile drops out entirely,
// otherwise the busiest game takes a tile and a row and says the same thing
// twice.
const selection = computed<ServerEntry[]>(() => {
  const liveIds = new Set(live.value.map(entry => entry.gs.id))
  const liveGames = new Set(live.value.flatMap(entry => entry.game ? [entry.game.id] : []))

  const groups = new Map<string, GameGroup>()

  // Grouping walks the ranking, so the first server into a group is the one it
  // leads with: busiest, then most recently busy.
  for (const entry of ranked.value) {
    if (liveIds.has(entry.gs.id) || (entry.game !== null && liveGames.has(entry.game.id)))
      continue

    const key = entry.game === null ? `server:${entry.gs.id}` : `game:${entry.game.id}`
    const at = entry.lastActive ? Date.parse(entry.lastActive.at) : 0
    const group = groups.get(key)

    if (group) {
      group.servers.push(entry)
      group.lastActiveAt = Math.max(group.lastActiveAt, at)
      continue
    }

    groups.set(key, {
      key,
      name: entry.game?.name ?? entry.gs.name,
      servers: [entry],
      lastActiveAt: at,
    })
  }

  return [...groups.values()]
    .sort((a, b) => {
      if (a.servers.length !== b.servers.length)
        return b.servers.length - a.servers.length

      if (a.lastActiveAt !== b.lastActiveAt)
        return b.lastActiveAt - a.lastActiveAt

      return a.name.localeCompare(b.name)
    })
    .slice(0, SHOWN_SELECTION)
    .flatMap(group => group.servers[0] ?? [])
})

const totalPlayers = computed(() => metrics.value?.gameservers.players ?? null)

// Right-hand line per row: who is on now, or who was on last if nobody is.
function activityLabel(entry: ServerEntry): string {
  if (entry.players > 0)
    return `${entry.players} player${entry.players === 1 ? '' : 's'}`

  if (entry.lastActive) {
    const { players, at } = entry.lastActive
    return `${players} player${players === 1 ? '' : 's'}, ${fromNow(at, Date.now(), 'narrow')}`
  }

  return 'quiet lately'
}

function connectFor(entry: ServerEntry) {
  return buildConnectContext(entry.game, entry.gs)
}

// With no address there is no connect action to reveal, so the row keeps
// showing its activity line on hover rather than fading into nothing.
function hasConnect(entry: ServerEntry): boolean {
  return (entry.gs.addresses?.length ?? 0) > 0
}

// The "Hop in" pick is a nudge towards something that isn't already on the
// card, so it draws from whatever the tiles and the rows left behind.
const hopIn = computed<ServerEntry | null>(() => {
  const takenIds = new Set([...live.value, ...selection.value].map(entry => entry.gs.id))
  const candidates = ranked.value.filter(entry => !takenIds.has(entry.gs.id) && hasConnect(entry))

  if (candidates.length === 0)
    return null

  return candidates[rollSeed % candidates.length] ?? null
})

// The metrics gate above covers the ordering, and the server rows arrive on
// their own clock, so the placeholder waits on both. Once the card has rows a
// later gameservers refresh doesn't knock it back to skeletons.
const loading = computed(() =>
  !ready.value || (gameserversLoading.value && entries.value.length === 0),
)
</script>

<template>
  <Flex column gap="m">
    <HomeDashboardCardHeader title="Gameservers" icon="ph:hard-drives" to="/servers/gameservers">
      <Skeleton v-if="loading" :height="20" :width="110" :radius="999" />
      <OnlineBadge
        v-else
        :count="totalPlayers"
        label="Players Online"
        singular="Player Online"
        size="s"
        clickable
        @click="activityModalOpen = true"
      />
    </HomeDashboardCardHeader>

    <template v-if="loading">
      <HomeDashboardSkeleton variant="cover" :count="SHOWN_LIVE" />
      <HomeDashboardSkeleton variant="rows" :count="SHOWN_SELECTION" icon action />
      <HomeDashboardSkeleton variant="rows" :count="1" icon action />
    </template>

    <HomeDashboardEmpty
      v-else-if="!entries.length"
      message="No servers configured yet."
    >
      <Button size="s" variant="gray" @click="navigateTo('/servers/gameservers')">
        Browse servers
      </Button>
    </HomeDashboardEmpty>

    <template v-else>
      <HomeDashboardSection :label="liveLabel">
        <div class="home-item-list">
          <template v-for="entry in live" :key="entry.gs.id">
            <GameArtCard
              v-if="entry.game"
              :game="entry.game"
              :title="entry.gs.name"
              :to="`/servers/gameservers/${entry.gs.id}`"
              :meta="activityLabel(entry)"
            >
              <template v-if="hasConnect(entry)" #action>
                <GameServerConnectButton
                  :addresses="entry.gs.addresses"
                  :port="entry.gs.port"
                  :connect="connectFor(entry)"
                  size="s"
                  variant="accent"
                  plain
                  stop-propagation
                />
              </template>
            </GameArtCard>

            <!-- No game means no artwork to borrow, so the tile falls back to
                 the same row the section below is made of. -->
            <HomeDashboardGameserverItem v-else :gs="entry.gs" :meta="activityLabel(entry)" />
          </template>

          <!-- Only one server exists at all. Pad the grid so the lone tile keeps
               its half instead of stretching across the card. -->
          <HomeDashboardPlaceholder v-if="live.length < SHOWN_LIVE" />
        </div>
      </HomeDashboardSection>

      <HomeDashboardSection v-if="selection.length" label="Other games we host">
        <Flex column gap="xs">
          <HomeDashboardGameserverItem
            v-for="entry in selection"
            :key="entry.gs.id"
            :gs="entry.gs"
            :game="entry.game"
            :meta="activityLabel(entry)"
          />
        </Flex>
      </HomeDashboardSection>

      <HomeDashboardSection v-if="hopIn" label="Hop in">
        <HomeDashboardGameserverItem :gs="hopIn.gs" :game="hopIn.game" />
      </HomeDashboardSection>
    </template>

    <ChartActivityHistogramModal
      v-model:open="activityModalOpen"
      title="Game Server Activity"
      :count="totalPlayers"
      count-label="players"
      count-singular="player"
      :series="['gameserversPlayers']"
      :initial-period="totalPlayers ? '24h' : '14d'"
    >
      <template #default="{ period, window, utc, color }">
        <ChartGameserversPlayers :period :window :utc :color hide-title />
      </template>
    </ChartActivityHistogramModal>
  </Flex>
</template>
