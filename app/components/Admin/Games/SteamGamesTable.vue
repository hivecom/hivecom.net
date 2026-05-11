<script setup lang="ts">
import type { Ref } from 'vue'
import type { MetricsHistoryEntry } from '@/composables/useDataMetrics'
import type { Tables } from '@/types/database.overrides'
import { Alert, Badge, Button, defineTable, Flex, Input, paginate, Pagination, Table, Tooltip } from '@dolanske/vui'
import { computed, inject, onBeforeMount, ref, watch } from 'vue'

import GameForm from '@/components/Admin/Games/GameForm.vue'

import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import ChartActivityHistogram from '@/components/Shared/Charts/ChartActivityHistogram.vue'
import ChartActivityHistogramModal from '@/components/Shared/Charts/ChartActivityHistogramModal.vue'
import ChartMembersGameActivity from '@/components/Shared/Charts/ChartMembersGameActivity.vue'
import OnlineBadge from '@/components/Shared/OnlineBadge.vue'
import SteamLink from '@/components/Shared/SteamLink.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { invalidateGamesCache } from '@/composables/useDataGames'
import { useDataMetrics } from '@/composables/useDataMetrics'
import { useUserId } from '@/composables/useUserId'
import { useBreakpoint } from '@/lib/mediaQuery'

const WHITESPACE_RE = /\s+/g

interface RpcSteamGame {
  steam_id: number
  name: string
  updated_at: string
  created_at: string
  total_count: number
}

const supabase = useSupabaseClient()
const userId = useUserId()

// ─── State ────────────────────────────────────────────────────────────────────

const loading = ref(true)
const initialLoad = ref(true)
const errorMessage = ref('')
const steamGames = ref<RpcSteamGame[]>([])
const trackedSteamIds = ref<Set<number>>(new Set())
const search = ref('')
const isBelowMedium = useBreakpoint('<m')

// Required to satisfy VUI's TableSelectionProvideSymbol context for Table.Root
defineTable(steamGames, { pagination: { enabled: false }, select: false })

// ─── Pagination & sort ────────────────────────────────────────────────────────

const page = ref(1)
const adminTablePerPage = inject<Ref<number>>('adminTablePerPage', computed(() => 10))
const totalCount = ref(0)
const steamRichPresenceCount = ref<number | null>(null)

const sortCol = ref<'name' | 'created_at'>('name')
const sortDir = ref<'asc' | 'desc'>('asc')

const paginationState = computed(() => paginate(totalCount.value, page.value, adminTablePerPage.value))
const shouldShowPagination = computed(() => totalCount.value > adminTablePerPage.value)

// ─── Activity metrics ─────────────────────────────────────────────────────────

const { metrics, fetchMetrics, fetchMetricsHistory } = useDataMetrics()

const localHistoryLoading = ref(false)
const localHistory = ref<MetricsHistoryEntry[]>([])

function getSteamGamePlayers(steamId: number): number {
  const bySteam = metrics.value?.members.bySteamGame
  if (!bySteam)
    return 0
  return bySteam[String(steamId)] ?? 0
}

function getSteamGameHistogram(steamId: number): number[] {
  const id = String(steamId)
  return localHistory.value.map(e => e.membersBySteamGame?.[id] ?? 0)
}

function getSteamGameTimestamps(): string[] {
  return localHistory.value.map(e => e.capturedAt)
}

// ─── Sort helpers ─────────────────────────────────────────────────────────────

function handleSort(col: 'name' | 'created_at') {
  if (sortCol.value === col) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  }
  else {
    sortCol.value = col
    sortDir.value = col === 'created_at' ? 'desc' : 'asc'
  }
  page.value = 1
  void fetchSteamGames()
}

function sortIcon(col: 'name' | 'created_at'): string {
  if (sortCol.value !== col)
    return 'ph:arrows-down-up'
  return sortDir.value === 'asc' ? 'ph:arrow-up' : 'ph:arrow-down'
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchSteamRichPresenceCount() {
  const { count } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .not('steam_id', 'is', null)
    .eq('rich_presence_enabled', true)
  steamRichPresenceCount.value = count ?? 0
}

async function fetchTrackedIds() {
  const { data } = await supabase.from('games').select('steam_id').not('steam_id', 'is', null)
  trackedSteamIds.value = new Set(
    (data ?? []).map((g: { steam_id: number | null }) => g.steam_id).filter((id): id is number => id !== null),
  )
}

async function fetchSteamGames() {
  loading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await supabase.rpc('get_admin_steam_games_paginated', {
      p_search: search.value,
      p_sort_col: sortCol.value,
      p_sort_dir: sortDir.value,
      p_limit: adminTablePerPage.value,
      p_offset: (page.value - 1) * adminTablePerPage.value,
    })

    if (error)
      throw error

    const rows = (data ?? []) as RpcSteamGame[]
    steamGames.value = rows
    totalCount.value = rows[0]?.total_count ?? 0
  }
  catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to load Steam games'
  }
  finally {
    initialLoad.value = false
    loading.value = false
  }
}

function setPage(p: number) {
  page.value = p
  void fetchSteamGames()
}

// ─── Watchers ─────────────────────────────────────────────────────────────────

let searchDebounce: ReturnType<typeof setTimeout> | null = null
watch(search, () => {
  if (searchDebounce)
    clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    page.value = 1
    void fetchSteamGames()
  }, 300)
})

watch(adminTablePerPage, () => {
  page.value = 1
  void fetchSteamGames()
})

// ─── Initial load ─────────────────────────────────────────────────────────────

onBeforeMount(async () => {
  await Promise.all([fetchSteamGames(), fetchTrackedIds(), fetchSteamRichPresenceCount()])

  if (metrics.value === null)
    fetchMetrics()

  localHistoryLoading.value = true
  try {
    localHistory.value = await fetchMetricsHistory('14d') ?? []
  }
  finally {
    localHistoryLoading.value = false
  }
})

// ─── Modal ────────────────────────────────────────────────────────────────────

const selectedGame = ref<RpcSteamGame | null>(null)
const showModal = ref(false)

function openModal(game: RpcSteamGame) {
  selectedGame.value = game
  showModal.value = true
}

// ─── GameForm ─────────────────────────────────────────────────────────────────

const showGameForm = ref(false)
const prefillSteamGame = ref<{ name: string, steam_id: number } | undefined>(undefined)

function openAddFromSteam(game: RpcSteamGame, event: MouseEvent) {
  event.stopPropagation()
  prefillSteamGame.value = { name: game.name, steam_id: game.steam_id }
  showGameForm.value = true
}

async function handleGameSave(gameData: Partial<Tables<'games'>>) {
  try {
    const normalizedData = { ...gameData }
    if (normalizedData.shorthand !== undefined) {
      if (normalizedData.shorthand === null || normalizedData.shorthand === '') {
        normalizedData.shorthand = null
      }
      else {
        normalizedData.shorthand = normalizedData.shorthand.toLowerCase().replace(WHITESPACE_RE, '') || null
      }
    }
    const { error } = await supabase
      .from('games')
      .insert({
        ...normalizedData,
        created_by: userId.value ?? null,
        modified_by: userId.value ?? null,
        modified_at: new Date().toISOString(),
      })
    if (error)
      throw error
    showGameForm.value = false
    await fetchTrackedIds()
    invalidateGamesCache()
  }
  catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to save game'
  }
}
</script>

<template>
  <Flex column expand>
    <Alert v-if="errorMessage" variant="danger">
      {{ errorMessage }}
    </Alert>

    <Flex v-else-if="initialLoad" gap="s" column expand>
      <Flex x-between y-center gap="s" wrap expand>
        <Input v-model="search" placeholder="Search Steam games..." size="s" :expand="isBelowMedium">
          <template #start>
            <Icon name="ph:magnifying-glass" />
          </template>
        </Input>
        <span class="text-color-lighter text-s">Total -</span>
        <Badge v-if="steamRichPresenceCount !== null" variant="info" filled>
          {{ steamRichPresenceCount }} with Steam linked & rich presence
        </Badge>
      </Flex>
      <TableSkeleton :columns="5" :rows="10" :show-actions="false" />
    </Flex>

    <Flex v-else gap="s" column expand>
      <Flex x-between y-center gap="s" wrap expand>
        <Input v-model="search" placeholder="Search Steam games..." size="s" :expand="isBelowMedium">
          <template #start>
            <Icon name="ph:magnifying-glass" />
          </template>
        </Input>
        <Flex y-center x-between :expand="isBelowMedium" :style="isBelowMedium ? { flexDirection: 'row-reverse' } : {}">
          <Tooltip v-if="steamRichPresenceCount !== null">
            <Badge size="s" variant="neutral" filled>
              {{ steamRichPresenceCount }} Users Providing Data
            </Badge>
            <template #tooltip>
              <p>Users with a Steam account linked and rich presence enabled</p>
            </template>
          </Tooltip>
          <span class="text-color-lighter text-s">Total {{ totalCount }}</span>
        </Flex>
      </Flex>

      <div class="table-loading-wrapper" :class="{ 'table-loading': loading && !initialLoad }">
        <TableContainer>
          <Table.Root v-if="steamGames.length > 0" separate-cells class="mb-l">
            <template #header>
              <Table.Head class="sortable-head" @click="handleSort('name')">
                <Flex gap="xs" y-center>
                  Name
                  <Icon :name="sortIcon('name')" size="14" class="sort-icon" />
                </Flex>
              </Table.Head>
              <Table.Head>Steam ID</Table.Head>
              <Table.Head>Activity</Table.Head>
              <Table.Head class="sortable-head" @click="handleSort('created_at')">
                <Flex gap="xs" y-center>
                  First Seen
                  <Icon :name="sortIcon('created_at')" size="14" class="sort-icon" />
                </Flex>
              </Table.Head>
              <Table.Head>Tracked</Table.Head>
            </template>

            <template #body>
              <tr
                v-for="game in steamGames"
                :key="game.steam_id"
                class="clickable-row"
                @click="openModal(game)"
              >
                <Table.Cell>
                  <span>{{ game.name }}</span>
                </Table.Cell>
                <Table.Cell @click.stop>
                  <SteamLink :steam-id="game.steam_id" size="small" />
                </Table.Cell>
                <Table.Cell>
                  <Flex y-center gap="s" style="max-width: 260px">
                    <OnlineBadge
                      :count="getSteamGamePlayers(game.steam_id)"
                      label="Playing"
                      size="s"
                      style="min-width: 78px"
                    />
                    <ChartActivityHistogram
                      v-if="!localHistoryLoading"
                      :data="getSteamGameHistogram(game.steam_id)"
                      :timestamps="getSteamGameTimestamps()"
                      :height="28"
                      gap="xxs"
                      expand
                    >
                      <template #tooltip="{ value, daysAgo }">
                        {{ value }} playing<template v-if="daysAgo">
                          - {{ daysAgo }}
                        </template>
                      </template>
                    </ChartActivityHistogram>
                  </Flex>
                </Table.Cell>
                <Table.Cell>
                  <TimestampDate :date="game.created_at" relative size="s" />
                </Table.Cell>
                <Table.Cell>
                  <Flex y-center gap="xs" @click.stop>
                    <Badge v-if="trackedSteamIds.has(game.steam_id)" variant="success" filled>
                      Yes
                    </Badge>
                    <template v-else>
                      <Badge variant="neutral">
                        No
                      </Badge>
                      <Tooltip>
                        <Button size="s" square variant="fill" @click="(e: MouseEvent) => openAddFromSteam(game, e)">
                          <Icon name="ph:plus" />
                        </Button>
                        <template #tooltip>
                          <p>Add as tracked game</p>
                        </template>
                      </Tooltip>
                    </template>
                  </Flex>
                </Table.Cell>
              </tr>
            </template>

            <template v-if="shouldShowPagination" #pagination>
              <Pagination :pagination="paginationState" @change="setPage" />
            </template>
          </Table.Root>

          <Alert v-else-if="!loading" variant="info">
            No Steam games found
          </Alert>
        </TableContainer>
      </div>
    </Flex>
  </Flex>

  <ChartActivityHistogramModal
    v-model:open="showModal"
    :title="selectedGame?.name ?? 'Activity'"
    :count="selectedGame ? getSteamGamePlayers(selectedGame.steam_id) : null"
    count-label="playing"
    count-singular="playing"
    :series="['membersSteamGameActivity']"
  >
    <template #default="{ period, window, utc, color }">
      <ChartMembersGameActivity
        :period="period"
        :window="window"
        :utc="utc"
        :color="color"
        :steam-game-id="selectedGame?.steam_id"
        hide-title
      />
    </template>
  </ChartActivityHistogramModal>

  <GameForm
    v-model:is-open="showGameForm"
    :game="null"
    :is-edit-mode="false"
    :prefill="prefillSteamGame"
    @save="handleGameSave"
  />
</template>

<style scoped lang="scss">
.mb-l {
  margin-bottom: var(--space-l);
}

td {
  vertical-align: middle;
}

.clickable-row:hover {
  td {
    cursor: pointer;
    background-color: var(--color-bg-raised);
  }
}

.table-loading-wrapper {
  width: 100%;
  overflow: hidden;
  transition: opacity var(--transition-slow);
}

.table-loading {
  opacity: 0.4;
  pointer-events: none;
}

.sortable-head {
  cursor: pointer;
  user-select: none;

  &:hover {
    background-color: var(--color-bg-raised);
  }
}

.sort-icon {
  opacity: 0.5;
}
</style>
