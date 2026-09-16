<script setup lang="ts">
import type { GameserverWithContainer } from '@/composables/useDataGameservers'
import type { MetricsHistoryEntry } from '@/composables/useDataMetrics'
import type { Tables } from '@/types/database.overrides'
import { Button, Flex, Skeleton } from '@dolanske/vui'
import { defineAsyncComponent } from 'vue'
import GameServerConnectButton from '@/components/GameServers/GameServerConnectButton.vue'
import HomeDashboardCardHeader from '@/components/Home/HomeDashboardCardHeader.vue'
import HomeDashboardEmpty from '@/components/Home/HomeDashboardEmpty.vue'
import HomeDashboardSection from '@/components/Home/HomeDashboardSection.vue'
import HomeDashboardSkeleton from '@/components/Home/HomeDashboardSkeleton.vue'
import GameIcon from '@/components/Shared/GameIcon.vue'
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

// Gameservers card: a short list led by whoever is busiest, then whoever was
// busy most recently, so an empty snapshot still says where people actually
// play. Each row carries its game icon and a launch action on hover.

const activityModalOpen = ref(false)

const SHOWN_SERVERS = 6

interface ServerEntry {
  gs: GameserverWithContainer
  game: Tables<'games'> | null
  players: number
  /** Most recent point in the last 90 days where this server had anyone on it. */
  lastActive: { players: number, at: string } | null
}

const { gameservers, loading: gameserversLoading } = useDataGameservers()
const { getById: getGameById } = useDataGames()
const { metrics, fetchMetrics, fetchMetricsHistoryIsolated, getCachedHistory, loading: metricsLoading } = useDataMetrics()

// Two windows, because one can't do both jobs. The 90d pass buckets by day, so
// it reaches back far enough that a server nobody has touched in weeks still
// says when it last had someone on it. The 24h pass buckets by 15 minutes and
// overwrites it, so anything recent is accurate to the quarter hour instead of
// rounding out to "a day ago". Both are smaller than a single 30d fetch.
// Seeded from the cache during setup rather than awaited in onMounted. Both
// fetchers are async even on a warm cache, and that one render is the
// difference between a returning visitor seeing the card and seeing skeletons.
const coarseHistory = ref<MetricsHistoryEntry[]>(getCachedHistory('90d') ?? [])
const fineHistory = ref<MetricsHistoryEntry[]>(getCachedHistory('24h') ?? [])

// Rolled once at setup so the pick holds still: re-rolling per render would
// reshuffle it every time a snapshot lands, and rolling on mount would make it
// jump one tick after a warm cache has already painted a choice.
const rollSeed = Math.floor(Math.random() * 100000)

onMounted(async () => {
  void fetchMetrics()

  const [coarse, fine] = await Promise.all([
    fetchMetricsHistoryIsolated('90d'),
    fetchMetricsHistoryIsolated('24h'),
  ])

  coarseHistory.value = coarse
  fineHistory.value = fine
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

const entries = computed<ServerEntry[]>(() =>
  gameservers.value
    .map((gs) => {
      const players = metricsPlayerCount(metrics.value?.gameservers.byServer[String(gs.id)])

      return {
        gs,
        game: isNil(gs.game) ? null : getGameById(gs.game),
        players: players ?? 0,
        lastActive: lastActiveByServer.value.get(String(gs.id)) ?? null,
      }
    })
    // A server with no reading at all has nothing to report either way.
    .filter(entry => !isNil(metrics.value?.gameservers.byServer[String(entry.gs.id)]) || entry.lastActive !== null),
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

const shown = computed(() => ranked.value.slice(0, SHOWN_SERVERS))

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
// list, so it draws from what the slice left behind.
const hopIn = computed<ServerEntry | null>(() => {
  const shownIds = new Set(shown.value.map(entry => entry.gs.id))
  const candidates = ranked.value.filter(entry => !shownIds.has(entry.gs.id) && hasConnect(entry))

  if (candidates.length === 0)
    return null

  return candidates[rollSeed % candidates.length] ?? null
})

// The list needs both the server rows and a metrics snapshot to say anything,
// so it stays a placeholder until whichever is slower arrives.
const loading = computed(() =>
  (gameserversLoading.value || metricsLoading.value) && shown.value.length === 0,
)
</script>

<template>
  <div>
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
      <HomeDashboardSkeleton variant="rows" :count="SHOWN_SERVERS" icon />
      <HomeDashboardSkeleton variant="rows" :count="1" icon />
    </template>

    <HomeDashboardEmpty
      v-else-if="!shown.length"
      icon="ph:game-controller"
      message="Every server is empty. Somebody has to go first."
    >
      <Button size="s" variant="gray" @click="navigateTo('/servers/gameservers')">
        Browse servers
      </Button>
    </HomeDashboardEmpty>

    <template v-else>
      <HomeDashboardSection label="Servers, busiest first">
        <Flex column gap="xs">
          <NuxtLink
            v-for="entry in shown"
            :key="entry.gs.id"
            :to="`/servers/gameservers/${entry.gs.id}`"
            class="home-item inline home-gameserver"
            :class="{ 'home-gameserver--connectable': hasConnect(entry) }"
          >
            <Flex y-center gap="s" class="home-gameserver__name">
              <GameIcon v-if="entry.game" :game="entry.game" size="s" />
              <strong>{{ entry.gs.name }}</strong>
            </Flex>

            <div class="home-gameserver__action">
              <span class="home-gameserver__activity">{{ activityLabel(entry) }}</span>

              <GameServerConnectButton
                class="home-gameserver__connect"
                :addresses="entry.gs.addresses"
                :port="entry.gs.port"
                :connect="connectFor(entry)"
                size="s"
                variant="accent"
                plain
                stop-propagation
              />
            </div>
          </NuxtLink>
        </Flex>
      </HomeDashboardSection>

      <HomeDashboardSection v-if="hopIn" label="Hop in">
        <NuxtLink :to="`/servers/gameservers/${hopIn.gs.id}`" class="home-item inline">
          <Flex y-center gap="s" class="home-gameserver__name">
            <GameIcon v-if="hopIn.game" :game="hopIn.game" size="s" />
            <strong>{{ hopIn.gs.name }}</strong>
          </Flex>

          <GameServerConnectButton
            :addresses="hopIn.gs.addresses"
            :port="hopIn.gs.port"
            :connect="connectFor(hopIn)"
            size="s"
            variant="accent"
            plain
            stop-propagation
          />
        </NuxtLink>
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
  </div>
</template>

<style scoped lang="scss">
.home-gameserver__name {
  min-width: 0;
}

// The activity line and the launch button share one cell, so the row is sized
// for the wider of the two and swapping them on hover doesn't shift the name.
.home-gameserver__action {
  display: grid;
  flex-shrink: 0;

  > * {
    grid-area: 1 / 1;
    align-self: center;
    justify-self: end;
  }
}

.home-gameserver__connect {
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--transition-duration) ease;
}

.home-gameserver__activity {
  transition: opacity var(--transition-duration) ease;
  white-space: nowrap;
}

.home-gameserver--connectable:hover,
.home-gameserver--connectable:focus-within {
  .home-gameserver__connect {
    opacity: 1;
    pointer-events: auto;
  }

  .home-gameserver__activity {
    opacity: 0;
  }
}

// No hover to reveal on touch, so the row keeps showing what it knows.
@media (hover: none) {
  .home-gameserver__connect {
    display: none;
  }

  .home-gameserver--connectable:hover .home-gameserver__activity {
    opacity: 1;
  }
}
</style>
