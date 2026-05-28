<script setup lang="ts">
import type { MetricsHistoryEntry, MetricsPeriod } from '@/composables/useDataMetrics'
import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { Accordion, Badge, Button, Card, Flex, Grid, Indicator, Modal, Skeleton, Tooltip } from '@dolanske/vui'
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import BulkAvatarDisplay from '@/components/Shared/BulkAvatarDisplay.vue'
import ChartActivityHistogramControls from '@/components/Shared/Charts/ChartActivityHistogramControls.vue'
import ErrorAlert from '@/components/Shared/ErrorAlert.vue'
import GameIcon from '@/components/Shared/GameIcon.vue'
import GlowCard from '@/components/Shared/GlowCard.vue'
import OnlineBadge from '@/components/Shared/OnlineBadge.vue'
import RegionIndicator from '@/components/Shared/RegionIndicator.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { useDataGameAssets } from '@/composables/useDataGameAssets'
import { useDataGames } from '@/composables/useDataGames'
import { useDataGameservers } from '@/composables/useDataGameservers'
import { useDataMetrics } from '@/composables/useDataMetrics'
import { useDataSteamPresences } from '@/composables/useDataSteamPresences'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = withDefaults(defineProps<Props>(), {
  gameId: null,
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'openServers', gameId: number): void
}>()

const ChartGameActivity = defineAsyncComponent(() => import('@/components/Shared/Charts/ChartGameActivity.vue'))

interface Props {
  gameId?: number | null
  open?: boolean
}

const isOpen = defineModel<boolean>('open', { default: false })

const { games, getById: getGameById } = useDataGames()
const { getGameCoverUrl, getGameBackgroundUrl } = useDataGameAssets()
const { gameservers } = useDataGameservers()
const { metrics, fetchMetricsHistoryIsolated, fetchMetricsWindowIsolated } = useDataMetrics()
const { currentPlayersForSteamId } = useDataSteamPresences()
const supabase = useSupabaseClient<Database>()
const user = useSupabaseUser()

const isBelowSmall = useBreakpoint('<xs')
const isMobile = useBreakpoint('<s')

// ── Core details cache ────────────────────────────────────────────────────────
interface GameDetailsEntry {
  game: Tables<'games'>
  coverUrl: string | null
  backgroundUrl: string | null
}

const currentDetails = ref<GameDetailsEntry | null>(null)
const loading = ref(false)
const error = ref('')
const detailsCache = new Map<number, GameDetailsEntry>()
let fetchToken = 0

// ── Recent events cache ───────────────────────────────────────────────────────
interface EventRow {
  id: number
  title: string
  date: string
  duration_minutes: number | null
  is_official: boolean | null
}

const eventsCache = new Map<number, EventRow[]>()
const recentEvents = ref<EventRow[]>([])
const eventsLoading = ref(false)

// ── Playtime cache ────────────────────────────────────────────────────────────
const playtimeCache = new Map<number, number>()
const minutesPlayed = ref(0)
const playtimeLoading = ref(false)

// ── Active chart window (driven by brush) ────────────────────────────────────
const activePeriod = ref<MetricsPeriod>('14d')
const activeWindow = ref<{ start: Date, end: Date } | null>(null)
const isolatedHistory = ref<MetricsHistoryEntry[]>([])
const hadActivity = ref(false)

// ── Computed ──────────────────────────────────────────────────────────────────
const isModalVisible = computed(() => Boolean(props.gameId) && isOpen.value)
const gameName = computed(() => currentDetails.value?.game.name ?? 'Game Details')
const heroImageUrl = computed(() => currentDetails.value?.backgroundUrl ?? currentDetails.value?.coverUrl ?? null)

const heroImageReady = ref(false)
watch(heroImageUrl, () => {
  heroImageReady.value = false
})
const steamUrl = computed(() => {
  const steamId = currentDetails.value?.game.steam_id
  return steamId ? `https://store.steampowered.com/app/${steamId}` : null
})
const websiteUrl = computed(() => {
  const raw = currentDetails.value?.game.website?.trim()
  return raw ?? null
})

const gameServersForGame = computed(() => {
  if (!props.gameId)
    return []
  return gameservers.value.filter(gs => gs.game === props.gameId)
})

const currentPlayerIds = computed(() => {
  const steamId = currentDetails.value?.game.steam_id
  return currentPlayersForSteamId(steamId)
})

const serverPlayerCount = computed(() => {
  if (!metrics.value || !props.gameId)
    return 0
  const byServer = metrics.value.gameservers.byServer
  let total = 0
  for (const gs of gameServersForGame.value) {
    if (!gs.query_protocol)
      continue
    const detail = byServer[String(gs.id)]
    if (!detail?.data)
      continue
    const count = detail.protocol === 'minecraft'
      ? (detail.data as { numPlayers?: number }).numPlayers
      : detail.protocol === 'source'
        ? (detail.data as { players?: number }).players
        : null
    total += count ?? 0
  }
  return total
})

// Peak players over active window (from isolated bucketed history)
const peakPlayers = computed(() => {
  if (!props.gameId)
    return 0
  let peak = 0
  for (const entry of isolatedHistory.value) {
    const count = entry.usersByGame?.[String(props.gameId)] ?? 0
    if (count > peak)
      peak = count
  }
  return peak
})

function formatMinutesPlayed(minutes: number): string {
  if (minutes === 0)
    return '0m'
  if (minutes < 60)
    return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24)
    return `${hours}h`
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }
  catch {
    return dateStr
  }
}

function formatTrackedSince(createdAt: string | null): string {
  if (!createdAt)
    return ''
  try {
    return new Date(createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
  }
  catch {
    return ''
  }
}

type ServerState = 'healthy' | 'running' | 'unhealthy' | 'offline' | 'unknown'

function getServerState(gs: typeof gameServersForGame.value[0]): ServerState {
  const container = gs.container
  if (!container)
    return 'unknown'
  if (container.server?.docker_control !== true)
    return 'unknown'
  if (container.server?.accessible === false)
    return 'unknown'
  if (container.running && container.healthy === null)
    return 'running'
  if (container.running && container.healthy)
    return 'healthy'
  if (container.running && !container.healthy)
    return 'unhealthy'
  return 'offline'
}

function isServerOnline(gs: typeof gameServersForGame.value[0]): boolean {
  const state = getServerState(gs)
  return state === 'healthy' || state === 'running'
}

function getServerPlayerCounts(gs: typeof gameServersForGame.value[0]): { current: number, max: number | null } | null {
  if (!metrics.value)
    return null
  const detail = metrics.value.gameservers.byServer[String(gs.id)]
  if (!detail?.data)
    return null
  if (detail.protocol === 'minecraft') {
    return {
      current: (detail.data as { numPlayers?: number }).numPlayers ?? 0,
      max: (detail.data as { maxPlayers?: number }).maxPlayers ?? null,
    }
  }
  if (detail.protocol === 'source') {
    return {
      current: (detail.data as { players?: number }).players ?? 0,
      max: (detail.data as { maxPlayers?: number }).maxPlayers ?? null,
    }
  }
  return null
}

// ── Data loading ──────────────────────────────────────────────────────────────
async function loadPlaytime(gameId: number, window?: { start: Date, end: Date }) {
  const cacheKey = window ? null : gameId // only cache period-based (non-custom) fetches
  if (cacheKey !== null && playtimeCache.has(cacheKey)) {
    minutesPlayed.value = playtimeCache.get(cacheKey) ?? 0
    return
  }
  playtimeLoading.value = true
  try {
    const since = window ? window.start.toISOString() : new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
    const until = window ? window.end.toISOString() : new Date().toISOString()
    const { data } = await supabase.rpc('get_game_playtime_minutes', {
      p_game_id: gameId,
      p_since: since,
      p_until: until,
    })
    const result = Math.round(data ?? 0)
    if (cacheKey !== null)
      playtimeCache.set(cacheKey, result)
    minutesPlayed.value = result
  }
  finally {
    playtimeLoading.value = false
  }
}

async function loadRecentEvents(gameId: number) {
  if (eventsCache.has(gameId)) {
    recentEvents.value = eventsCache.get(gameId) ?? []
    return
  }
  eventsLoading.value = true
  try {
    const { data } = await supabase
      .from('events')
      .select('id, title, date, duration_minutes, is_official')
      .contains('games', [gameId])
      .order('date', { ascending: false })
      .limit(5)
    const rows = (data ?? []) as EventRow[]
    eventsCache.set(gameId, rows)
    recentEvents.value = rows
  }
  finally {
    eventsLoading.value = false
  }
}

async function loadGameDetails(gameId: number) {
  if (detailsCache.has(gameId)) {
    currentDetails.value = detailsCache.get(gameId) ?? null
    loading.value = false
    error.value = ''
    return
  }

  loading.value = true
  error.value = ''
  const currentFetchToken = ++fetchToken

  try {
    const data = getGameById(gameId)

    if (currentFetchToken !== fetchToken)
      return

    if (!data) {
      currentDetails.value = null
      error.value = 'Game not found.'
      return
    }

    const [coverUrl, backgroundUrl] = await Promise.all([
      getGameCoverUrl(data),
      getGameBackgroundUrl(data),
    ])

    const entry: GameDetailsEntry = { game: data, coverUrl, backgroundUrl }
    detailsCache.set(gameId, entry)
    currentDetails.value = entry
  }
  catch (err) {
    if (currentFetchToken === fetchToken) {
      error.value = err instanceof Error ? err.message : 'Unable to load game details.'
      currentDetails.value = null
    }
  }
  finally {
    if (currentFetchToken === fetchToken)
      loading.value = false
  }
}

function getEventStatus(ev: EventRow): { type: 'upcoming' | 'ongoing' | 'past', label: string } {
  const now = new Date()
  const start = new Date(ev.date)
  const end = ev.duration_minutes
    ? new Date(start.getTime() + ev.duration_minutes * 60 * 1000)
    : start

  if (now < start)
    return { type: 'upcoming', label: 'UPCOMING' }
  else if (now >= start && now <= end)
    return { type: 'ongoing', label: 'NOW' }
  else
    return { type: 'past', label: 'PAST' }
}

function handleClose() {
  isOpen.value = false
  emit('close')
}

async function handleChartChange(period: MetricsPeriod, window: { start: Date, end: Date }) {
  if (!props.gameId)
    return
  activePeriod.value = period
  activeWindow.value = window
  const [history] = await Promise.all([
    fetchMetricsWindowIsolated(window.start, window.end),
    loadPlaytime(props.gameId, window),
  ])
  isolatedHistory.value = history
}
// Re-attempt lookup when games list populates
watch(games, () => {
  if (props.gameId && isOpen.value && !currentDetails.value)
    void loadGameDetails(props.gameId)
})

watch(
  [() => props.gameId, () => isOpen.value],
  ([gameId, open]) => {
    if (!gameId) {
      currentDetails.value = null
      recentEvents.value = []
      minutesPlayed.value = 0
      error.value = ''
      loading.value = false
      return
    }

    if (detailsCache.has(gameId))
      currentDetails.value = detailsCache.get(gameId) ?? null

    if (open) {
      void loadGameDetails(gameId)
      void loadRecentEvents(gameId)
      activePeriod.value = '14d'
      activeWindow.value = null
      hadActivity.value = false
      void fetchMetricsHistoryIsolated('14d').then((h) => {
        isolatedHistory.value = h
      })
      void fetchMetricsHistoryIsolated('90d').then((h) => {
        if (!hadActivity.value)
          hadActivity.value = h.some(e => (e.usersByGame?.[String(gameId)] ?? 0) > 0)
      })
      void loadPlaytime(gameId)
    }
  },
  { immediate: true },
)
</script>

<template>
  <Modal :open="isModalVisible" centered :size="isBelowSmall ? 'screen' : 'l'" :card="{ separators: true }" @close="handleClose">
    <template #header>
      <Flex gap="m" y-center>
        <GameIcon v-if="currentDetails?.game" :game="currentDetails.game" size="m" />
        <h3 class="game-details-modal__title">
          {{ gameName }}
        </h3>
        <Tooltip v-if="currentDetails?.game.created_at" placement="top">
          <template #tooltip>
            <p>Tracked since {{ formatTrackedSince(currentDetails.game.created_at) }}</p>
          </template>
        </Tooltip>
      </Flex>
    </template>

    <div class="game-details-modal">
      <!-- Loading State -->
      <div v-if="loading" class="game-details-modal__loading">
        <Skeleton height="180px" width="100%" />
        <Skeleton height="20px" width="60%" />
        <Skeleton height="16px" width="40%" />
      </div>

      <!-- Error State -->
      <ErrorAlert v-else-if="error" :message="error" />

      <!-- Content -->
      <div v-else-if="currentDetails" class="game-details-modal__content">
        <!-- Hero image / metadata accordion -->
        <Accordion
          v-if="currentDetails.game.description || currentDetails.game.markdown || currentDetails.game.genre_tags?.length || currentDetails.game.multiplayer_modes?.length || currentDetails.game.release_date"
          unstyled
          class="game-details-modal__media-accordion"
        >
          <template #trigger="{ toggle, isOpen: metaOpen }">
            <div class="game-details-modal__media" :class="{ 'game-details-modal__media--empty': !heroImageUrl }" @click="toggle()">
              <div v-if="heroImageUrl && !heroImageReady" class="game-details-modal__media-skeleton" />
              <img
                v-if="heroImageUrl"
                :src="heroImageUrl"
                :alt="`${gameName} artwork`"
                loading="lazy"
                :class="{ 'game-details-modal__media-img--ready': heroImageReady }"
                @load="heroImageReady = true"
              >
              <div v-else class="game-details-modal__media-placeholder">
                <Icon name="ph:image" size="32" />
                <span>No artwork available</span>
              </div>
              <div class="game-details-modal__media-hint">
                <Icon :name="metaOpen ? 'ph:caret-up' : 'ph:info'" size="14" />
              </div>
            </div>
          </template>

          <div class="game-details-modal__meta">
            <div v-if="currentDetails.backgroundUrl ?? currentDetails.coverUrl" class="game-details-modal__meta-bg" :style="{ backgroundImage: `url(${currentDetails.backgroundUrl ?? currentDetails.coverUrl})` }" />
            <div class="game-details-modal__meta-content">
              <Flex gap="m">
                <img
                  v-if="currentDetails.coverUrl"
                  :src="currentDetails.coverUrl"
                  :alt="gameName"
                  class="game-details-modal__meta-cover"
                >
                <Flex column gap="s" class="game-details-modal__meta-text">
                  <p v-if="currentDetails.game.description" class="text-s text-color-light">
                    {{ currentDetails.game.description }}
                  </p>
                  <p v-if="currentDetails.game.markdown" class="text-s text-color-lighter">
                    {{ currentDetails.game.markdown }}
                  </p>
                  <Flex v-if="currentDetails.game.genre_tags?.length || currentDetails.game.multiplayer_modes?.length || currentDetails.game.release_date" wrap gap="xs" y-center>
                    <Badge v-for="tag in currentDetails.game.genre_tags" :key="tag" variant="neutral" size="s">
                      {{ tag }}
                    </Badge>
                    <Badge v-for="mode in currentDetails.game.multiplayer_modes" :key="mode" variant="info" size="s">
                      {{ mode }}
                    </Badge>
                    <TimestampDate v-if="currentDetails.game.release_date" :date="currentDetails.game.release_date" format="YYYY" size="xs" />
                  </Flex>
                </Flex>
              </Flex>
            </div>
          </div>
        </Accordion>

        <!-- Hero image (no metadata) -->
        <div v-else class="game-details-modal__media" :class="{ 'game-details-modal__media--empty': !heroImageUrl }">
          <div v-if="heroImageUrl && !heroImageReady" class="game-details-modal__media-skeleton" />
          <img
            v-if="heroImageUrl"
            :src="heroImageUrl"
            :alt="`${gameName} artwork`"
            loading="lazy"
            :class="{ 'game-details-modal__media-img--ready': heroImageReady }"
            @load="heroImageReady = true"
          >
          <div v-else class="game-details-modal__media-placeholder">
            <Icon name="ph:image" size="32" />
            <span>No artwork available</span>
          </div>
        </div>

        <!-- Live activity row (logged in only) -->
        <Flex v-if="user && (currentPlayerIds.length > 0 || serverPlayerCount > 0)" gap="m" y-center wrap>
          <Flex v-if="currentPlayerIds.length > 0" gap="s" y-center class="game-details-modal__live-row">
            <OnlineBadge
              :count="currentPlayerIds.length"
              label="playing now"
              singular="playing now"
              size="m"
            />
            <BulkAvatarDisplay
              :user-ids="currentPlayerIds"
              :max-users="8"
              :avatar-size="36"
              :gap="-8"
              :show-names="false"
              cluster
              no-empty-state
            />
          </Flex>
          <Badge v-if="serverPlayerCount > 0" variant="neutral" size="m">
            <Icon name="ph:hard-drives" size="12" />
            {{ serverPlayerCount }} on servers
          </Badge>
        </Flex>

        <!-- Stats grid -->
        <div class="game-details-modal__stats-grid">
          <Card v-if="currentDetails.game.steam_id" class="stat-card">
            <Flex column gap="xs">
              <span class="stat-card__label">Peak players ({{ activePeriod }})</span>
              <Skeleton v-if="playtimeLoading" height="20px" width="40px" :radius="3" />
              <span v-else class="stat-card__value">{{ peakPlayers }}</span>
            </Flex>
          </Card>
          <Card v-if="currentDetails.game.steam_id" class="stat-card">
            <Flex column gap="xs">
              <span class="stat-card__label">Time played ({{ activePeriod }})</span>
              <Skeleton v-if="playtimeLoading" height="20px" width="40px" :radius="3" />
              <span v-else class="stat-card__value">{{ formatMinutesPlayed(minutesPlayed) }}</span>
            </Flex>
          </Card>
          <NuxtLink v-if="gameServersForGame.length > 0" :to="`/servers/gameservers?tab=list&game=${props.gameId}`" class="stat-card-link" @click="handleClose">
            <GlowCard>
              <Card class="stat-card stat-card--link">
                <Flex column gap="xs">
                  <span class="stat-card__label">Servers</span>
                  <span class="stat-card__value">{{ gameServersForGame.length }}</span>
                </Flex>
              </Card>
            </GlowCard>
          </NuxtLink>
          <NuxtLink v-if="recentEvents.length > 0" :to="`/events?game=${props.gameId}`" class="stat-card-link" @click="handleClose">
            <GlowCard>
              <Card class="stat-card stat-card--link">
                <Flex column gap="xs">
                  <span class="stat-card__label">Recent events</span>
                  <span class="stat-card__value">{{ recentEvents.length }}</span>
                </Flex>
              </Card>
            </GlowCard>
          </NuxtLink>
        </div>
        <div v-if="hadActivity" class="game-details-modal__chart">
          <ChartActivityHistogramControls :series="['usersGameActivity']" :game-id="gameId ?? undefined" @change="handleChartChange">
            <template #default="{ period, window, utc, color }">
              <ChartGameActivity :period :window :utc :color :game-id="gameId ?? undefined" hide-title :skeleton-height="180" />
            </template>
          </ChartActivityHistogramControls>
        </div>

        <!-- Servers list -->
        <div v-if="gameServersForGame.length > 0" class="game-details-modal__section">
          <Flex y-center x-between>
            <h4 class="game-details-modal__section-title">
              Community Servers
            </h4>
            <NuxtLink
              v-if="gameServersForGame.length > 4"
              :to="`/servers/gameservers?tab=list&game=${props.gameId}`"
              class="game-details-modal__link"
              @click="handleClose"
            >
              <Button variant="link" size="s">
                See all {{ gameServersForGame.length }}
                <template #end>
                  <Icon name="ph:arrow-right" />
                </template>
              </Button>
            </NuxtLink>
          </Flex>
          <Flex column gap="s">
            <NuxtLink
              v-for="gs in gameServersForGame.slice(0, 4)"
              :key="gs.id"
              :to="`/servers/gameservers/${gs.id}`"
              class="game-details-modal__server-card"
              @click="handleClose"
            >
              <Flex y-center gap="s" expand x-between>
                <Flex y-center gap="s" class="game-details-modal__server-card-name">
                  <Tooltip placement="top">
                    <Indicator :variant="isServerOnline(gs) ? 'online' : 'offline'" outline />
                    <template #tooltip>
                      <p>{{ isServerOnline(gs) ? 'Online' : getServerState(gs) === 'unhealthy' ? 'Unhealthy' : getServerState(gs) === 'unknown' ? 'Unknown' : 'Offline' }}</p>
                    </template>
                  </Tooltip>
                  <span class="text-s game-details-modal__server-name">{{ gs.name }}</span>
                  <Badge
                    v-if="getServerPlayerCounts(gs) !== null"
                    size="s"
                    :variant="(getServerPlayerCounts(gs)?.current ?? 0) > 0 ? 'success' : 'neutral'"
                  >
                    {{ getServerPlayerCounts(gs)?.current ?? 0 }}/{{ getServerPlayerCounts(gs)?.max ?? '?' }}
                  </Badge>
                </Flex>
                <RegionIndicator v-if="gs.region" :region="(gs.region as 'eu' | 'na' | 'all')" show-label />
              </Flex>
            </NuxtLink>
          </Flex>
        </div>

        <!-- Recent events list -->
        <div v-if="recentEvents.length > 0" class="game-details-modal__section">
          <Flex y-center x-between>
            <h4 class="game-details-modal__section-title">
              Recent Events
            </h4>
            <NuxtLink :to="`/events?game=${props.gameId}`" class="game-details-modal__link" @click="handleClose">
              <Button variant="link" size="s">
                See all
                <template #end>
                  <Icon name="ph:arrow-right" />
                </template>
              </Button>
            </NuxtLink>
          </Flex>
          <Grid :columns="isMobile ? 1 : 2" gap="s">
            <NuxtLink
              v-for="(ev, index) in recentEvents"
              :key="ev.id"
              :to="`/events/${ev.id}`"
              class="game-details-modal__event-card" :class="[{ 'game-details-modal__event-card--full': recentEvents.length % 2 !== 0 && index === recentEvents.length - 1 }]"
              @click="handleClose"
            >
              <Flex column gap="xxs">
                <Flex expand x-between y-center gap="xs">
                  <span class="text-s text-bold game-details-modal__event-title">{{ ev.title }}</span>
                  <Badge v-if="getEventStatus(ev).type !== 'past'" :variant="getEventStatus(ev).type === 'ongoing' ? 'success' : 'accent'" size="s">
                    {{ getEventStatus(ev).label }}
                  </Badge>
                </Flex>
                <span class="text-xs text-color-lighter">{{ formatDate(ev.date) }}</span>
              </Flex>
            </NuxtLink>
          </Grid>
        </div>
      </div>

      <div v-else class="game-details-modal__empty">
        <Flex column gap="s" y-center>
          <Icon name="ph:warning" size="32" />
          <span>No game selected.</span>
        </Flex>
      </div>
    </div>

    <template #footer>
      <Flex gap="s" x-end expand wrap>
        <NuxtLink
          v-if="currentDetails?.game.discussion_topic_id"
          :to="`/forum?activeTopicId=${encodeURIComponent(currentDetails.game.discussion_topic_id ?? '')}`"
          class="game-details-modal__link"
          @click="handleClose"
        >
          <Button :expand="isBelowSmall">
            <template #start>
              <Icon name="ph:chats" />
            </template>
            Forum Topic
          </Button>
        </NuxtLink>
        <NuxtLink
          v-if="websiteUrl"
          :to="websiteUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="game-details-modal__link"
        >
          <Button :expand="isBelowSmall">
            <template #start>
              <Icon name="ph:globe" />
            </template>
            Visit Website
          </Button>
        </NuxtLink>
        <NuxtLink
          v-if="steamUrl"
          :to="steamUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="game-details-modal__link"
        >
          <Button variant="accent" :expand="isBelowSmall">
            <template #start>
              <Icon name="ph:steam-logo" />
            </template>
            View on Steam
          </Button>
        </NuxtLink>
        <Button variant="gray" :expand="isBelowSmall" @click="handleClose">
          Close
        </Button>
      </Flex>
    </template>
  </Modal>
</template>

<style scoped lang="scss">
.game-details-modal {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);

  &__loading {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
  }

  &__content {
    display: flex;
    flex-direction: column;
    gap: var(--space-m);
  }

  &__media {
    position: relative;
    border-radius: var(--border-radius-l);
    overflow: hidden;
    border: 1px solid var(--color-border);
    background: var(--color-bg-medium);

    img {
      width: 100%;
      height: 240px;
      object-fit: cover;
      display: block;
      opacity: 0;
      transition: opacity var(--transition-slow);
    }

    &--empty {
      border-style: dashed;
    }
  }

  &__media-accordion {
    :deep(.vui-accordion-content) {
      margin-top: 0;
    }

    &.open .game-details-modal__media {
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
      border-bottom-color: transparent;
    }

    .game-details-modal__media {
      cursor: pointer;
    }
  }

  &__media-hint {
    position: absolute;
    bottom: var(--space-xs);
    right: var(--space-s);
    color: var(--color-text-lighter);
    opacity: 0.7;
  }

  &__media-img--ready {
    opacity: 1 !important;
  }

  &__media-skeleton {
    position: absolute;
    inset: 0;
    background: var(--color-bg-raised);
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  &__media-placeholder {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    align-items: center;
    justify-content: center;
    height: 180px;
    color: var(--color-text-light);
    font-size: var(--font-size-s);
  }

  &__chart {
    :deep(.chart-container) {
      min-height: 0;
      padding: 0;
      background: none;
      border: none;
      border-radius: 0;
    }

    :deep(.chart-wrapper) {
      height: 180px;
    }

    :deep(.chart-loading),
    :deep(.chart-error),
    :deep(.chart-empty) {
      height: 180px;
    }

    :deep(.chart-lines-skeleton) {
      height: 150px !important;
    }

    :deep(.y-axis-skeleton) {
      height: 150px !important;
    }
  }

  &__live-row {
    flex-wrap: nowrap;
  }

  &__stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: var(--space-s);
  }

  &__section {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
  }

  &__section-title {
    margin: 0;
    font-size: var(--font-size-s);
    color: var(--color-text-light);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  &__server-card {
    display: block;
    width: 100%;
    padding: var(--space-s) var(--space-s);
    border-radius: var(--border-radius-s);
    border: 1px solid var(--color-border);
    background: var(--color-bg-raised);
    text-decoration: none;
    color: var(--color-text);
    transition: var(--transition);

    &:hover {
      background: var(--color-bg-medium);
      border-color: var(--color-border-strong);
    }
  }

  &__server-card-name {
    min-width: 0;
    flex: 1;
  }

  &__server-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  &__event-card {
    display: block;
    padding: var(--space-s);
    border-radius: var(--border-radius-s);
    border: 1px solid var(--color-border);
    background: var(--color-bg-raised);
    text-decoration: none;
    color: var(--color-text);
    transition: var(--transition);

    &:hover {
      background: var(--color-bg-medium);
      border-color: var(--color-border-strong);
    }

    &--full {
      grid-column: 1 / -1;
    }
  }

  &__event-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__meta {
    position: relative;
    border-radius: 0 0 var(--border-radius-l) var(--border-radius-l);
    overflow: hidden;
    border: 1px solid var(--color-border);
    border-top: none;
  }

  &__meta-bg {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
    filter: blur(16px) brightness(0.3);
    transform: scale(1.1);
  }

  &__meta-content {
    position: relative;
    padding: var(--space-m);
  }

  &__meta-text {
    flex: 1;
    min-width: 0;
  }

  &__meta-cover {
    flex-shrink: 0;
    width: 90px;
    align-self: flex-start;
    border-radius: var(--border-radius-s);
    object-fit: cover;
  }

  &__title {
    margin: 0;
  }

  &__empty {
    padding: var(--space-l);
    border-radius: var(--border-radius-m);
    border: 1px dashed var(--color-border);
    text-align: center;
    color: var(--color-text-light);
  }
}

.game-details-modal__link {
  display: contents;
}

.stat-card-link {
  text-decoration: none;
}

.stat-card {
  transition: var(--transition);

  &--link:hover {
    :deep(.vui-card) {
      background: var(--color-bg-medium);
      border-color: var(--color-border-strong);
    }
  }
}

.stat-card {
  :deep(.vui-card-content) {
    padding: var(--space-s);
  }

  &__label {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    white-space: nowrap;
  }

  &__value {
    font-size: var(--font-size-xl);
    font-weight: bold;
    color: var(--color-text);
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.5;
  }
}
</style>
