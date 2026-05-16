<script setup lang="ts">
import type { Ref } from 'vue'
import type { MetricsHistoryEntry } from '@/composables/useDataMetrics'
import type { Tables } from '@/types/database.overrides'
import { Alert, Button, defineTable, Flex, paginate, Pagination, Table } from '@dolanske/vui'
import { computed, inject, onBeforeMount, onMounted, ref, watch } from 'vue'

import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import GameIcon from '@/components/GameServers/GameIcon.vue'
import ChartActivityHistogram from '@/components/Shared/Charts/ChartActivityHistogram.vue'
import OnlineBadge from '@/components/Shared/OnlineBadge.vue'
import SteamLink from '@/components/Shared/SteamLink.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import { useAdminPermissions } from '@/composables/useAdminPermissions'
import { invalidateGamesCache } from '@/composables/useDataGames'
import { useDataMetrics } from '@/composables/useDataMetrics'
import { useUserId } from '@/composables/useUserId'
import { useBreakpoint } from '@/lib/mediaQuery'
import { getRouteQueryString } from '@/lib/utils/common'
import GameDetails from './GameDetails.vue'
import GameFilters from './GameFilters.vue'
import GameForm from './GameForm.vue'

const WHITESPACE_RE = /\s+/g

interface RpcGame {
  id: number
  name: string
  shorthand: string | null
  steam_id: number | null
  website: string | null
  created_at: string
  created_by: string | null
  modified_at: string | null
  modified_by: string | null
  total_count: number
}

const supabase = useSupabaseClient()
const route = useRoute()
const router = useRouter()
const userId = useUserId()
const isBelowMedium = useBreakpoint('<m')
const { hasPermission } = useAdminPermissions()

const canCreate = computed(() => hasPermission('games.create'))
const canManageResource = computed(() =>
  hasPermission('games.update') || hasPermission('games.delete'),
)

// ─── State ────────────────────────────────────────────────────────────────────

const loading = ref(true)
const initialLoad = ref(true)
const errorMessage = ref('')
const games = ref<RpcGame[]>([])
const search = ref('')

// Required to provide VUI's TableSelectionProvideSymbol context for Table.Root
defineTable(games, { pagination: { enabled: false }, select: false })

// ─── Pagination & sort ────────────────────────────────────────────────────────

const page = ref(1)
const adminTablePerPage = inject<Ref<number>>('adminTablePerPage', computed(() => 10))
const totalCount = ref(0)

const sortCol = ref('name')
const sortDir = ref<'asc' | 'desc'>('asc')

const paginationState = computed(() => paginate(totalCount.value, page.value, adminTablePerPage.value))
const shouldShowPagination = computed(() => totalCount.value > adminTablePerPage.value)

// ─── Detail / form state ──────────────────────────────────────────────────────

const selectedGame = ref<Tables<'games'> | null>(null)
const showGameDetails = ref(false)
const showGameForm = ref(false)
const isEditMode = ref(false)

const focusedGameId = computed(() => {
  const raw = getRouteQueryString(route.query.game)
  const parsed = Number.parseInt(raw, 10)
  return Number.isNaN(parsed) ? null : parsed
})

// ─── Sort helpers ─────────────────────────────────────────────────────────────

const sortColMap: Record<string, string> = {
  Name: 'name',
  Shorthand: 'shorthand',
}

function handleSort(label: string) {
  const col = sortColMap[label]
  if (!col)
    return
  if (sortCol.value === col) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  }
  else {
    sortCol.value = col
    sortDir.value = 'asc'
  }
  page.value = 1
  void fetchGames()
}

function sortIcon(label: string): string {
  const col = sortColMap[label]
  if (sortCol.value !== col)
    return 'ph:arrows-down-up'
  return sortDir.value === 'asc' ? 'ph:arrow-up' : 'ph:arrow-down'
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchGames() {
  loading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await supabase.rpc('get_admin_games_paginated', {
      p_search: search.value,
      p_sort_col: sortCol.value,
      p_sort_dir: sortDir.value,
      p_limit: adminTablePerPage.value,
      p_offset: (page.value - 1) * adminTablePerPage.value,
    })

    if (error)
      throw error

    const rows = (data ?? []) as RpcGame[]
    games.value = rows
    totalCount.value = rows[0]?.total_count ?? 0
  }
  catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to load games'
  }
  finally {
    initialLoad.value = false
    loading.value = false
  }
}

function setPage(p: number) {
  page.value = p
  void fetchGames()
}

// ─── Detail open/close ────────────────────────────────────────────────────────

async function openGameDetails(game: RpcGame) {
  showGameDetails.value = true
  void router.replace({ query: { ...route.query, game: String(game.id) } })

  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('id', game.id)
    .single()

  if (!error && data)
    selectedGame.value = data
}

watch(showGameDetails, (open) => {
  if (!open) {
    const query = { ...route.query }
    delete query.game
    void router.replace({ query })
  }
})

function openAddGameForm() {
  selectedGame.value = null
  isEditMode.value = false
  showGameForm.value = true
}

function openEditGameForm(game: Tables<'games'>) {
  selectedGame.value = game
  isEditMode.value = true
  showGameForm.value = true
}

function handleEditFromDetails(game: Tables<'games'>) {
  selectedGame.value = game
  isEditMode.value = true
  showGameDetails.value = false
  showGameForm.value = true
}

// ─── Actions ──────────────────────────────────────────────────────────────────

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

    if (isEditMode.value && selectedGame.value) {
      const { error } = await supabase
        .from('games')
        .update({
          ...normalizedData,
          modified_at: new Date().toISOString(),
          modified_by: userId.value ?? null,
        })
        .eq('id', selectedGame.value.id)
      if (error)
        throw error
    }
    else {
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
    }

    showGameForm.value = false
    invalidateGamesCache()
    await fetchGames()
  }
  catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'An error occurred while saving the game'
  }
}

async function handleGameDelete(gameId: number) {
  try {
    const { error } = await supabase
      .from('games')
      .delete()
      .eq('id', gameId)
    if (error)
      throw error

    showGameForm.value = false
    invalidateGamesCache()
    await fetchGames()
  }
  catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'An error occurred while deleting the game'
  }
}

// ─── Activity (client-side) ───────────────────────────────────────────────────

const { metrics, fetchMetrics, fetchDailyHistory } = useDataMetrics()

const localHistoryLoading = ref(false)
const localHistory = ref<MetricsHistoryEntry[]>([])

onMounted(async () => {
  if (metrics.value === null)
    fetchMetrics()
  localHistoryLoading.value = true
  try {
    localHistory.value = await fetchDailyHistory() ?? []
  }
  finally {
    localHistoryLoading.value = false
  }
})

const gameSteamIdMap = computed(() => {
  const map = new Map<number, number>()
  for (const g of games.value) {
    if (g.steam_id != null)
      map.set(g.id, g.steam_id)
  }
  return map
})

function getGameHistogram(gameId: number): number[] {
  const steamId = gameSteamIdMap.value.get(gameId)
  if (steamId != null) {
    const key = String(steamId)
    return localHistory.value.map(e => e.usersBySteamGame?.[key] ?? 0)
  }
  const key = String(gameId)
  return localHistory.value.map(e => e.usersByGame?.[key] ?? 0)
}

function getGameTimestamps(): string[] {
  return localHistory.value.map(e => e.capturedAt)
}

function getGamePlayers(gameId: number): number {
  const steamId = gameSteamIdMap.value.get(gameId)
  if (steamId != null) {
    const bySteam = metrics.value?.users.bySteamGame
    return bySteam?.[String(steamId)] ?? 0
  }
  const byGame = metrics.value?.users.byGame
  if (!byGame)
    return 0
  return byGame[String(gameId)] ?? 0
}

// ─── Watchers ─────────────────────────────────────────────────────────────────

let searchDebounce: ReturnType<typeof setTimeout> | null = null
watch(search, () => {
  if (searchDebounce)
    clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    page.value = 1
    void fetchGames()
  }, 300)
})

watch(adminTablePerPage, () => {
  page.value = 1
  void fetchGames()
})

// ─── Initial load + URL-driven open ───────────────────────────────────────────

onBeforeMount(async () => {
  await fetchGames()
  const id = focusedGameId.value
  if (id !== null) {
    const match = games.value.find(g => g.id === id)
    if (match)
      await openGameDetails(match)
  }
})
</script>

<template>
  <Flex column expand>
    <Alert v-if="errorMessage" variant="danger">
      {{ errorMessage }}
    </Alert>

    <Flex v-else-if="initialLoad" gap="s" column expand>
      <Flex
        :column="isBelowMedium"
        :x-between="!isBelowMedium"
        :x-start="isBelowMedium"
        y-center
        gap="s"
        expand
      >
        <Flex gap="s" y-center wrap :expand="isBelowMedium" :x-center="isBelowMedium">
          <GameFilters v-model:search="search" />
        </Flex>

        <Flex
          gap="s"
          :y-center="!isBelowMedium"
          :y-start="isBelowMedium"
          :wrap="isBelowMedium"
          :x-end="!isBelowMedium"
          :x-center="isBelowMedium"
          :x-start="isBelowMedium"
          :expand="isBelowMedium"
          :column-reverse="isBelowMedium"
        >
          <span class="text-color-lighter text-s" :class="{ 'text-center': isBelowMedium }">Total -</span>

          <Button v-if="canCreate" variant="accent" :expand="isBelowMedium" @click="openAddGameForm">
            <template #start>
              <Icon name="ph:plus" />
            </template>
            Add Game
          </Button>
        </Flex>
      </Flex>

      <TableSkeleton :columns="4" :rows="10" :show-actions="canManageResource" />
    </Flex>

    <Flex v-else gap="s" column expand>
      <Flex
        :column="isBelowMedium"
        :x-between="!isBelowMedium"
        :x-start="isBelowMedium"
        y-center
        gap="s"
        expand
      >
        <Flex gap="s" y-center wrap :expand="isBelowMedium" :x-center="isBelowMedium">
          <GameFilters v-model:search="search" />
        </Flex>

        <Flex
          gap="s"
          :y-center="!isBelowMedium"
          :y-start="isBelowMedium"
          :wrap="isBelowMedium"
          :x-end="!isBelowMedium"
          :x-center="isBelowMedium"
          :x-start="isBelowMedium"
          :expand="isBelowMedium"
          :column-reverse="isBelowMedium"
        >
          <span class="text-color-lighter text-s" :class="{ 'text-center': isBelowMedium }">
            Total {{ totalCount }}
          </span>

          <Button v-if="canCreate" variant="accent" :expand="isBelowMedium" @click="openAddGameForm">
            <template #start>
              <Icon name="ph:plus" />
            </template>
            Add Game
          </Button>
        </Flex>
      </Flex>

      <div class="table-loading-wrapper" :class="{ 'table-loading': loading && !initialLoad }">
        <TableContainer>
          <Table.Root v-if="games.length > 0" separate-cells class="mb-l">
            <template #header>
              <Table.Head class="sortable-head" @click="handleSort('Name')">
                <Flex gap="xs" y-center>
                  Name
                  <Icon :name="sortIcon('Name')" size="14" class="sort-icon" />
                </Flex>
              </Table.Head>
              <Table.Head class="sortable-head" @click="handleSort('Shorthand')">
                <Flex gap="xs" y-center>
                  Shorthand
                  <Icon :name="sortIcon('Shorthand')" size="14" class="sort-icon" />
                </Flex>
              </Table.Head>
              <Table.Head>Steam</Table.Head>
              <Table.Head>Activity</Table.Head>
              <Table.Head v-if="canManageResource" />
            </template>

            <template #body>
              <tr
                v-for="game in games"
                :key="game.id"
                class="clickable-row"
                @click="openGameDetails(game)"
              >
                <Table.Cell>
                  <Flex gap="xs" y-center>
                    <GameIcon :game="game as unknown as Tables<'games'>" size="xs" />
                    <span class="text-s">{{ game.name }}</span>
                  </Flex>
                </Table.Cell>
                <Table.Cell>
                  <code v-if="game.shorthand">{{ game.shorthand }}</code>
                  <span v-else class="text-color-lighter">-</span>
                </Table.Cell>
                <Table.Cell @click.stop>
                  <SteamLink :steam-id="game.steam_id" size="small" />
                </Table.Cell>
                <Table.Cell>
                  <span v-if="game.steam_id === null" class="text-color-lighter text-s">Not a Steam game</span>
                  <Flex v-else y-center gap="s" style="max-width: 260px">
                    <OnlineBadge
                      :count="getGamePlayers(game.id)"
                      label="Playing"
                      size="s"
                      style="min-width: 78px"
                    />
                    <ChartActivityHistogram
                      v-if="!localHistoryLoading"
                      :data="getGameHistogram(game.id)"
                      :timestamps="getGameTimestamps()"
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
                <Table.Cell v-if="canManageResource" @click.stop>
                  <AdminActions
                    resource-type="games"
                    :item="game as unknown as Record<string, unknown>"
                    button-size="s"
                    @edit="(item) => openEditGameForm(item as unknown as Tables<'games'>)"
                    @delete="(item) => handleGameDelete((item as unknown as RpcGame).id)"
                  />
                </Table.Cell>
              </tr>
            </template>

            <template v-if="shouldShowPagination" #pagination>
              <Pagination :pagination="paginationState" @change="setPage" />
            </template>
          </Table.Root>

          <Alert v-else-if="!loading" variant="info">
            No games found
          </Alert>
        </TableContainer>
      </div>
    </Flex>
  </Flex>

  <GameDetails
    v-model:is-open="showGameDetails"
    :game="selectedGame"
    @edit="(item) => handleEditFromDetails(item as unknown as Tables<'games'>)"
    @delete="(item) => handleGameDelete((item as unknown as Tables<'games'>).id)"
  />

  <GameForm
    v-model:is-open="showGameForm"
    :game="selectedGame"
    :is-edit-mode="isEditMode"
    @save="handleGameSave"
    @delete="handleGameDelete"
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
