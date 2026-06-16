<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'
import type { MetricsHistoryEntry } from '@/composables/useDataMetrics'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database.overrides'
import { Alert, Badge, Button, defineTable, DropdownItem, Flex, Pagination, Table } from '@dolanske/vui'
import { computed, onMounted, watch } from 'vue'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import ChartActivityHistogram from '@/components/Shared/Charts/ChartActivityHistogram.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import GameIcon from '@/components/Shared/GameIcon.vue'
import OnlineBadge from '@/components/Shared/OnlineBadge.vue'
import RegionIndicator from '@/components/Shared/RegionIndicator.vue'
import SelectedRowsActions from '@/components/Shared/SelectedRowsActions.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import { useAdminCrudTable } from '@/composables/useAdminCrudTable'
import { invalidateGameserversCache } from '@/composables/useDataGameservers'
import { useDataMetrics } from '@/composables/useDataMetrics'
import { useDiscussionSubscriptionsCache } from '@/composables/useDiscussionSubscriptionsCache'
import { useBreakpoint } from '@/lib/mediaQuery'
import { metricsPlayerCount } from '@/types/metrics'
import GameserverDetails from './GameServerDetails.vue'
import GameserverFilters from './GameServerFilters.vue'
import GameserverForm from './GameServerForm.vue'

const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

const supabase = useSupabaseClient()
const userId = useUserId()
const subscriptionsCache = useDiscussionSubscriptionsCache()
const route = useRoute()
const router = useRouter()
const isBelowMedium = useBreakpoint('<m')

const gameserversQuery = supabase.from('network_gameservers').select(`
  *,
  game (
    id,
    name,
    shorthand
  )
`)

type QueryGameserver = QueryData<typeof gameserversQuery>[0]

interface SelectOption {
  label: string
  value: string
}

interface TransformedGameserver extends Record<string, unknown> {
  Name: string
  Game: string | null
  Region: string | null
  Activity: number | null
  Container: string | null
}

// Filter states kept local - region/game filters go beyond simple search
const regionFilter = ref<{ label: string, value: string }[]>()
const gameFilter = ref<number[]>([])

const regionOptions: SelectOption[] = [
  { label: 'Europe', value: 'eu' },
  { label: 'North America', value: 'na' },
  { label: 'Multi-Region', value: 'all' },
  { label: 'No Region', value: 'none' },
]

const {
  items: gameservers,
  loading,
  errorMessage,
  filteredRows: searchFilteredRows,
  totalCount,
  search,
  selectedItem: selectedGameserver,
  showDetails: showGameserverDetails,
  showForm: showGameserverForm,
  isEditMode,
  canManageResource,
  canCreate,
  adminTablePerPage,
  viewItem: viewGameserver,
  openAdd: openAddGameserverForm,
  openEdit: openEditGameserverForm,
  handleEditFromDetails,
  refresh: fetchGameservers,
} = useAdminCrudTable<QueryGameserver, TransformedGameserver>({
  resourceType: 'network_gameservers',
  // URL param sync handled manually below (also needs to set tab= param)
  queryParamKey: false,
  refreshSignal,
  fetch: async () => {
    const { data, error } = await gameserversQuery
    if (error)
      throw error
    return data ?? []
  },
  transform: gameserver => ({
    Name: gameserver.name,
    Game: gameserver.game?.name ?? 'Unknown',
    Region: gameserver.region ?? 'Unknown',
    Activity: null,
    Container: gameserver.container,
  }),
  defaultSort: { column: 'Name', direction: 'asc' },
})

// Compute game entries from loaded data
const gameEntries = computed<Tables<'games'>[]>(() => {
  const uniqueGames = new Map<number, Tables<'games'>>()
  gameservers.value.forEach((gs) => {
    if (gs.game?.id) {
      uniqueGames.set(gs.game.id, gs.game as unknown as Tables<'games'>)
    }
  })
  return Array.from(uniqueGames.values())
})

const { latestMetrics, fetchLatestMetrics, fetchDailyHistory } = useDataMetrics()

const localHistoryLoading = ref(false)
const localHistory = ref<MetricsHistoryEntry[]>([])

onMounted(async () => {
  fetchLatestMetrics()
  localHistoryLoading.value = true
  try {
    localHistory.value = await fetchDailyHistory() ?? []
  }
  finally {
    localHistoryLoading.value = false
  }
})

function getServerHistogram(gameserverId: number): number[] {
  const id = String(gameserverId)
  return localHistory.value
    .map(e => e.gameserversByServer?.[id] ?? 0)
}

function getServerTimestamps(): string[] {
  return localHistory.value.map(e => e.capturedAt)
}

function getServerPlayers(gameserverId: number): number | null {
  const byServer = latestMetrics.value?.gameservers?.byServer
  if (!byServer)
    return null
  return metricsPlayerCount(byServer[String(gameserverId)])
}

// Apply secondary filters on top of the composable's search-filtered rows
const filteredData = computed(() => {
  return searchFilteredRows.value.filter((row) => {
    if (regionFilter.value != null && regionFilter.value.length > 0) {
      const filterVal = regionFilter.value[0]?.value
      if (filterVal === 'none') {
        if (row._original.region != null)
          return false
      }
      else if (row._original.region !== filterVal) {
        return false
      }
    }

    if (gameFilter.value != null && gameFilter.value.length > 0 && row._original.game) {
      if (!gameFilter.value.includes(row._original.game.id))
        return false
    }

    return true
  }).map(row => ({
    ...row,
    Activity: getServerPlayers(row._original.id),
  }))
})

const filteredCount = computed(() => filteredData.value.length)
const isFiltered = computed(() => filteredCount.value !== totalCount.value)

const { headers, rows, pagination, setPage, setSort, options, selectedRows, deselectAllRows } = defineTable(filteredData, {
  pagination: { enabled: true, perPage: adminTablePerPage.value },
  select: true,
})

watch(adminTablePerPage, (perPage) => {
  options.value.pagination.perPage = perPage
  setPage(1)
})

setSort('Name', 'asc')

// Manual URL param sync - also needs to preserve/set tab= param
const focusedGameserverId = computed(() => {
  const raw = route.query.gameserver
  const str = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')
  const parsed = Number.parseInt(str, 10)
  return Number.isNaN(parsed) ? null : parsed
})

watch(showGameserverDetails, (isOpen) => {
  if (isOpen && selectedGameserver.value) {
    void router.replace({
      query: { ...route.query, tab: 'Gameservers', gameserver: selectedGameserver.value.id },
    })
    return
  }
  if (isOpen)
    return
  if (route.query.gameserver == null)
    return
  const rest = { ...route.query }
  delete rest.gameserver
  void router.replace({ query: rest })
})

watch(
  () => [focusedGameserverId.value, loading.value] as const,
  ([id, isLoading]) => {
    if (isLoading || id === null)
      return
    const match = gameservers.value.find(gs => gs.id === id)
    if (match)
      viewGameserver(match)
  },
  { immediate: true },
)

interface GameserverSecretPayload {
  // New secret to store (Vault), or null to leave the existing one untouched.
  secret: string | null
  // Remove any stored secret.
  clear: boolean
}

// Persist the per-gameserver query secret (e.g. Factorio RCON password) to
// Vault via the dedicated RPCs. The plaintext never lives on the row.
async function persistGameserverSecret(gameserverId: number, payload: GameserverSecretPayload) {
  if (payload.clear) {
    const { error } = await supabase.rpc('delete_gameserver_query_secret', {
      p_gameserver_id: gameserverId,
    })
    if (error)
      throw error
    return
  }
  if (payload.secret) {
    const { error } = await supabase.rpc('set_gameserver_query_secret', {
      p_gameserver_id: gameserverId,
      p_secret: payload.secret,
    })
    if (error)
      throw error
  }
}

async function handleGameserverSave(
  gameserverData: TablesInsert<'network_gameservers'> | TablesUpdate<'network_gameservers'>,
  secretPayload?: GameserverSecretPayload,
) {
  try {
    let gameserverId: number | null = null

    if (isEditMode.value && selectedGameserver.value) {
      const { error } = await supabase
        .from('network_gameservers')
        .update({
          ...gameserverData,
          modified_at: new Date().toISOString(),
          modified_by: userId.value ?? null,
        })
        .eq('id', selectedGameserver.value.id)
      if (error)
        throw error
      gameserverId = selectedGameserver.value.id
    }
    else {
      const { data, error } = await supabase
        .from('network_gameservers')
        .insert({
          ...gameserverData,
          created_by: userId.value ?? null,
          modified_by: userId.value ?? null,
          modified_at: new Date().toISOString(),
        } as TablesInsert<'network_gameservers'>)
        .select('id')
        .single()
      if (error)
        throw error
      gameserverId = data?.id ?? null

      if (userId.value)
        subscriptionsCache.invalidateList(userId.value)
    }

    if (secretPayload && gameserverId != null)
      await persistGameserverSecret(gameserverId, secretPayload)

    showGameserverForm.value = false
    invalidateGameserversCache()
    await fetchGameservers()
  }
  catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'An error occurred while saving the game server'
  }
}

async function handleGameserversDelete(gameserverIds: number[]) {
  try {
    const { error } = await supabase
      .from('network_gameservers')
      .delete()
      .in('id', gameserverIds)
    if (error)
      throw error

    showGameserverForm.value = false
    invalidateGameserversCache()
    await fetchGameservers()
  }
  catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'An error occurred while deleting the game server'
  }
}

function clearFilters() {
  search.value = ''
  regionFilter.value = undefined
  gameFilter.value = []
}

// Bulk deletion
const showBulkDeleteConfirm = ref(false)

async function handleBulkDelete() {
  showBulkDeleteConfirm.value = false
  const ids = [...selectedRows.value].map(row => row._original.id)
  await handleGameserversDelete(ids)
  deselectAllRows()
}
</script>

<template>
  <Alert v-if="errorMessage" variant="danger">
    {{ errorMessage }}
  </Alert>

  <template v-else-if="loading">
    <Flex gap="s" column expand>
      <Flex :column="isBelowMedium" :x-between="!isBelowMedium" :x-start="isBelowMedium" y-center gap="s" expand>
        <GameserverFilters
          v-model:search="search"
          v-model:region-filter="regionFilter"
          v-model:game-filter="gameFilter"
          :region-options="regionOptions"
          :game-entries="gameEntries"
          :expand="isBelowMedium"
          @clear-filters="clearFilters"
        />

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

          <Button v-if="canCreate" variant="accent" :expand="isBelowMedium" @click="openAddGameserverForm">
            <template #start>
              <Icon name="ph:plus" />
            </template>
            Add Game Server
          </Button>
        </Flex>
      </Flex>

      <TableSkeleton :columns="5" :rows="10" :show-actions="canManageResource" />
    </Flex>
  </template>

  <Flex v-else gap="s" column expand>
    <Flex :column="isBelowMedium" :x-between="!isBelowMedium" :x-start="isBelowMedium" y-center gap="s" expand>
      <GameserverFilters
        v-model:search="search"
        v-model:region-filter="regionFilter"
        v-model:game-filter="gameFilter"
        :region-options="regionOptions"
        :game-entries="gameEntries"
        :expand="isBelowMedium"
        @clear-filters="clearFilters"
      />

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
          {{ isFiltered ? `Filtered ${filteredCount}` : `Total ${totalCount}` }}
        </span>

        <Button v-if="canCreate" variant="accent" :expand="isBelowMedium" @click="openAddGameserverForm">
          <template #start>
            <Icon name="ph:plus" />
          </template>
          Add Game Server
        </Button>
      </Flex>
    </Flex>

    <TableContainer>
      <Table.Root v-if="rows && rows.length > 0" separate-cells :loading="loading" class="mb-l">
        <template #header>
          <th class="vui-table-interactive-cell" />
          <Table.Head v-for="header in headers.filter(h => h.label !== '_original')" :key="header.label" sort :header />
          <Table.Head
            v-if="canManageResource"
            key="actions"
            :header="{ label: 'Actions',
                       sortToggle: () => {} }"
          />
        </template>

        <template #body>
          <tr v-for="gameserver in rows" :key="gameserver._original.id" class="clickable-row">
            <Table.SelectRow :row="gameserver as any" />
            <Table.Cell @click="viewGameserver(gameserver._original as QueryGameserver)">
              {{ gameserver.Name }}
            </Table.Cell>
            <Table.Cell @click="viewGameserver(gameserver._original as QueryGameserver)">
              <Flex v-if="(gameserver._original as QueryGameserver).game" gap="xs" y-center>
                <GameIcon :game="(gameserver._original as QueryGameserver).game as Tables<'games'>" size="xs" />
                <span class="text-s">{{ gameserver.Game }}</span>
              </Flex>
              <span v-else class="text-s">{{ gameserver.Game }}</span>
            </Table.Cell>
            <Table.Cell @click="viewGameserver(gameserver._original as QueryGameserver)">
              <RegionIndicator :region="gameserver._original.region" show-label />
            </Table.Cell>
            <Table.Cell @click="viewGameserver(gameserver._original as QueryGameserver)">
              <template v-if="(gameserver._original as QueryGameserver).query_protocol != null">
                <Flex y-center gap="s" style="max-width: 260px">
                  <OnlineBadge
                    :count="getServerPlayers((gameserver._original as QueryGameserver).id)"
                    label="Players"
                    singular="Player"
                    size="s"
                    style="min-width: 78px"
                  />
                  <ChartActivityHistogram
                    v-if="!localHistoryLoading"
                    :data="getServerHistogram((gameserver._original as QueryGameserver).id)"
                    :timestamps="getServerTimestamps()"
                    :height="28"
                    gap="xxs"
                    expand
                  >
                    <template #tooltip="{ value, daysAgo }">
                      {{ value }} players<template v-if="daysAgo">
                        - {{ daysAgo }}
                      </template>
                    </template>
                  </ChartActivityHistogram>
                </Flex>
              </template>
              <span v-else class="text-color-lighter text-xs">No query</span>
            </Table.Cell>
            <Table.Cell @click="viewGameserver(gameserver._original as QueryGameserver)">
              <Badge v-if="gameserver.Container" variant="neutral" outline>
                {{ gameserver.Container }}
              </Badge>
              <span v-else>-</span>
            </Table.Cell>
            <Table.Cell v-if="canManageResource" @click.stop>
              <AdminActions
                resource-type="network_gameservers"
                :item="gameserver._original"
                button-size="s"
                :custom-actions="[
                  {
                    icon: 'ph:cube',
                    label: 'Open Container',
                    handler: () => navigateTo(`/admin/network?tab=Containers&container=${encodeURIComponent(String((gameserver._original as QueryGameserver).container || ''))}`),
                    condition: () => !!(gameserver._original as QueryGameserver).container,
                  },
                ]"
                @edit="(item) => openEditGameserverForm(item as QueryGameserver)"
                @delete="(item) => handleGameserversDelete([item.id as number])"
              />
            </Table.Cell>
          </tr>
        </template>

        <template v-if="filteredData.length > adminTablePerPage" #pagination>
          <Pagination :pagination="pagination" @change="setPage" />
        </template>
      </Table.Root>
    </TableContainer>

    <Flex v-if="!loading && (!rows || rows.length === 0)" expand>
      <Alert variant="info" class="w-100">
        No game servers found
      </Alert>
    </Flex>
  </Flex>

  <GameserverDetails
    v-model:is-open="showGameserverDetails"
    :gameserver="selectedGameserver"
    @edit="handleEditFromDetails"
    @delete="(id: number) => handleGameserversDelete([id])"
  />

  <GameserverForm
    v-model:is-open="showGameserverForm"
    :gameserver="selectedGameserver"
    :is-edit-mode="isEditMode"
    @save="handleGameserverSave"
    @delete="(id: number) => handleGameserversDelete([id])"
  />

  <SelectedRowsActions
    :selected-count="selectedRows.length"
    @clear="deselectAllRows()"
  >
    <DropdownItem @click="showBulkDeleteConfirm = true">
      <template #icon>
        <Icon name="ph:trash" class="text-color-red" />
      </template>
      Delete
    </DropdownItem>
  </SelectedRowsActions>

  <!-- Bulk Delete Confirmation Modal -->
  <ConfirmModal
    :open="showBulkDeleteConfirm"
    :title="`Delete ${selectedRows.length} items`"
    :description="`Are you sure you want to delete ${selectedRows.length} game servers? This action cannot be undone.`"
    confirm-text="Delete"
    cancel-text="Cancel"
    :destructive="true"
    @cancel="showBulkDeleteConfirm = false"
    @confirm="handleBulkDelete"
  />
</template>

<style scoped lang="scss">
.mb-l {
  margin-bottom: var(--space-l);
}
.w-100 {
  width: 100%;
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
</style>
