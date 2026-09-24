<script setup lang="ts">
import type { GameserverSheetRow } from '@/components/Home/HomeDashboardGameserversSheet.vue'
import type { GameserverWithContainer } from '@/composables/useDataGameservers'
import type { MetricsHistoryEntry } from '@/composables/useDataMetrics'
import type { Tables } from '@/types/database.overrides'
import { Button, Flex, Skeleton } from '@dolanske/vui'
import { defineAsyncComponent } from 'vue'
import GameServerConnectButton from '@/components/GameServers/GameServerConnectButton.vue'
import HomeDashboardCardHeader from '@/components/Home/HomeDashboardCardHeader.vue'
import HomeDashboardEmpty from '@/components/Home/HomeDashboardEmpty.vue'
import HomeDashboardGameserverItem from '@/components/Home/HomeDashboardGameserverItem.vue'
import HomeDashboardGameserversSheet from '@/components/Home/HomeDashboardGameserversSheet.vue'
import HomeDashboardPlaceholder from '@/components/Home/HomeDashboardPlaceholder.vue'
import HomeDashboardSection from '@/components/Home/HomeDashboardSection.vue'
import HomeDashboardSkeleton from '@/components/Home/HomeDashboardSkeleton.vue'
import GameArtCard from '@/components/Shared/GameArtCard.vue'
import OnlineBadge from '@/components/Shared/OnlineBadge.vue'
import { useDataGames } from '@/composables/useDataGames'
import { useDataGameservers } from '@/composables/useDataGameservers'
import { PERIOD_CONFIGS, useDataMetrics } from '@/composables/useDataMetrics'
import { buildConnectContext } from '@/composables/useGameConnect'
import { isNil } from '@/lib/utils/common'
import { fromNow } from '@/lib/utils/date'
import { metricsPlayerCount } from '@/types/metrics'

const ChartGameserversPlayers = defineAsyncComponent(() => import('@/components/Shared/Charts/ChartGameserversPlayers.vue'))
const ChartActivityHistogramModal = defineAsyncComponent(() => import('@/components/Shared/Charts/ChartActivityHistogramModal.vue'))

// The rows are one per game on purpose. Ranked by activity alone, one busy game
// takes half the card and nobody finds out what else is running.

const activityModalOpen = ref(false)

const SHOWN_LIVE = 2
const SHOWN_SELECTION = 3

interface ServerEntry {
  gs: GameserverWithContainer
  game: Tables<'games'> | null
  players: number
  /** Last time in 90 days this server had anyone on it */
  lastActive: { players: number, at: string } | null
}

const { gameservers, loading: gameserversLoading } = useDataGameservers()
const { getById: getGameById } = useDataGames()
const { metrics, fetchMetrics, fetchMetricsHistoryIsolated, getCachedHistory, scheduleRefresh } = useDataMetrics()

// 90d daily buckets reach servers idle for weeks. 24h quarter-hour buckets keep
// recent activity precise. Both together are smaller than a single 30d fetch.
const cachedCoarse = getCachedHistory('90d')
const cachedFine = getCachedHistory('24h')

const coarseHistory = ref<MetricsHistoryEntry[]>(cachedCoarse ?? [])
const fineHistory = ref<MetricsHistoryEntry[]>(cachedFine ?? [])

// All three feed the sort, so painting on the first one reshuffles the rows a
// beat later. The refs seed synchronously so a warm cache skips the skeletons.
const ready = ref(metrics.value !== null && cachedCoarse !== null && cachedFine !== null)

// Rolled at setup. Per render it reshuffles on every snapshot, and on mount it
// jumps after a warm cache has painted.
const rollSeed = Math.floor(Math.random() * 100000)

onMounted(async () => {
  // fetchMetrics rethrows, and a dead snapshot mustn't leave the card on skeletons
  const [, coarse, fine] = await Promise.all([
    fetchMetrics().catch(() => null),
    fetchMetricsHistoryIsolated('90d'),
    fetchMetricsHistoryIsolated('24h'),
  ])

  coarseHistory.value = coarse
  fineHistory.value = fine
  ready.value = true

  // The isolated history has to ask. Each window refetches when one of its
  // buckets rolls over, since nothing new can show up before that.
  scheduleRefresh('90d', (entries) => {
    coarseHistory.value = entries
  }, { cadenceMs: PERIOD_CONFIGS['90d'].bucketMs })

  scheduleRefresh('24h', (entries) => {
    fineHistory.value = entries
  }, { cadenceMs: PERIOD_CONFIGS['24h'].bucketMs })
})

// Buckets come oldest first, so the last write per server is its most recent active reading
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

// Alphabetical tie-break so the tail doesn't reshuffle on every snapshot
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

// With exactly one server live the second tile goes: "Live right now" over an
// empty server reads as a lie
const live = computed(() => {
  const top = ranked.value.slice(0, SHOWN_LIVE)
  const populated = top.filter(entry => entry.players > 0)

  return populated.length === 1 ? populated : top
})

const liveLabel = computed(() =>
  live.value.some(entry => entry.players > 0) ? 'Live right now' : 'Where people played last',
)

interface GameGroup {
  /** Game id, or the server's own id when it has no game */
  key: string
  name: string
  servers: ServerEntry[]
  lastActiveAt: number
}

// A game already on a tile drops out, or it shows as both a tile and a row
const selection = computed<ServerEntry[]>(() => {
  const liveIds = new Set(live.value.map(entry => entry.gs.id))
  const liveGames = new Set(live.value.flatMap(entry => entry.game ? [entry.game.id] : []))

  const groups = new Map<string, GameGroup>()

  // Walks the ranking, so each group leads with its busiest server
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

function hasConnect(entry: ServerEntry): boolean {
  return (entry.gs.addresses?.length ?? 0) > 0
}

// Draws from whatever the tiles and rows left behind
const hopIn = computed<ServerEntry | null>(() => {
  const takenIds = new Set([...live.value, ...selection.value].map(entry => entry.gs.id))
  const candidates = ranked.value.filter(entry => !takenIds.has(entry.gs.id) && hasConnect(entry))

  if (candidates.length === 0)
    return null

  return candidates[rollSeed % candidates.length] ?? null
})

const serversSheetOpen = ref(false)

const sheetServers = computed<GameserverSheetRow[]>(() =>
  ranked.value.map(entry => ({ gs: entry.gs, game: entry.game, meta: activityLabel(entry) })),
)

function openServersSheet(): void {
  serversSheetOpen.value = true
}

// Waits on metrics and the server rows. Once rows exist a refresh doesn't
// knock the card back to skeletons.
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
                  variant="gray"
                  plain
                  stop-propagation
                />
              </template>
            </GameArtCard>

            <!-- No game means no artwork, so fall back to a row -->
            <HomeDashboardGameserverItem v-else :gs="entry.gs" :meta="activityLabel(entry)" />
          </template>

          <!-- Keeps a lone server's tile to half the row. A single live tile
               is trimmed on purpose and takes the full row. -->
          <HomeDashboardPlaceholder v-if="entries.length < SHOWN_LIVE" />
        </div>
      </HomeDashboardSection>

      <HomeDashboardSection
        v-if="selection.length"
        label="Other games we host"
        @click="openServersSheet"
      >
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

    <HomeDashboardGameserversSheet
      :open="serversSheetOpen"
      :servers="sheetServers"
      @close="serversSheetOpen = false"
    />

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
