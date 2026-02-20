<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'
import type { Ref } from 'vue'
import type { TablesInsert, TablesUpdate } from '@/types/database.types'

import { Alert, Button, defineTable, Flex, Pagination, Table } from '@dolanske/vui'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import RegionIndicator from '@/components/Shared/RegionIndicator.vue'

import TableContainer from '@/components/Shared/TableContainer.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { useBreakpoint } from '@/lib/mediaQuery'
import GameserverDetails from './GameServerDetails.vue'
import GameserverFilters from './GameServerFilters.vue'
import GameserverForm from './GameServerForm.vue'

// Type from the query result
type QueryGameserver = QueryData<typeof gameserversQuery>[0]

// Define interface for transformed gameserver data
interface TransformedGameserver {
  Name: string
  Game: string | null
  Region: string | null
  Created: string
  Container: string | null
  _original: QueryGameserver
}

// Define interface for Select options
interface SelectOption {
  label: string
  value: string
}

// Define model value for refresh signal to parent
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

// Get admin permissions
const { canManageResource, canCreate } = useTableActions('gameservers')
const route = useRoute()
const router = useRouter()

// Define query
const supabase = useSupabaseClient()
const userId = useUserId()
const gameserversQuery = supabase.from('gameservers').select(`
  *,
  game (
    id,
    name,
    shorthand
  )
`)

// Data states
const loading = ref(true)
const errorMessage = ref('')
const gameservers = ref<QueryData<typeof gameserversQuery>>([])
const search = ref('')
const regionFilter = ref<SelectOption[]>()
const gameFilter = ref<SelectOption[]>()
const isBelowMedium = useBreakpoint('<m')

// Gameserver detail state
const selectedGameserver = ref<QueryGameserver | null>(null)
const showGameserverDetails = ref(false)

const focusedGameserverId = computed(() => {
  const gameserverQuery = route.query.gameserver
  const rawValue = typeof gameserverQuery === 'string'
    ? gameserverQuery
    : Array.isArray(gameserverQuery) && gameserverQuery[0]
      ? gameserverQuery[0]
      : ''
  const parsed = Number.parseInt(rawValue, 10)
  return Number.isNaN(parsed) ? null : parsed
})

// Gameserver form state
const showGameserverForm = ref(false)
const isEditMode = ref(false)

// Filter options
const regionOptions: SelectOption[] = [
  { label: 'Europe', value: 'eu' },
  { label: 'North America', value: 'na' },
  { label: 'Multi-Region', value: 'all' },
  { label: 'No Region', value: 'none' },
]

// Compute unique game options for the filter
const gameOptions = computed<SelectOption[]>(() => {
  const uniqueGames = new Map<number, string>()
  gameservers.value.forEach((gameserver: QueryGameserver) => {
    if (gameserver.game?.name) {
      uniqueGames.set(gameserver.game.id, gameserver.game.name)
    }
  })

  return Array.from(uniqueGames.entries()).map(([id, name]) => ({
    label: name,
    value: id.toString(),
  }))
})

// Filter based on search, region, and game
const filteredData = computed<TransformedGameserver[]>(() => {
  const filtered = gameservers.value.filter((item: QueryGameserver) => {
    // Filter by search term
    if (search.value && !Object.values(item).some((value) => {
      if (value === null || value === undefined)
        return false
      if (typeof value === 'object' && value !== null) {
        return Object.values(value).some(v =>
          v !== null && String(v).toLowerCase().includes(search.value.toLowerCase()),
        )
      }
      return String(value).toLowerCase().includes(search.value.toLowerCase())
    })) {
      return false
    }

    // Filter by region
    if (regionFilter.value && regionFilter.value.length > 0) {
      const regionFilterValue = regionFilter.value[0]?.value
      if (regionFilterValue === 'none') {
        // Filter for game servers with no region (null or undefined)
        if (item.region) {
          return false
        }
      }
      else if (item.region !== regionFilterValue) {
        return false
      }
    }

    // Filter by game
    if (gameFilter.value && gameFilter.value.length > 0 && item.game) {
      const gameFilterValue = Number.parseInt(gameFilter.value[0]?.value || '0')
      if (item.game.id !== gameFilterValue) {
        return false
      }
    }

    return true
  })

  // Transform the data into explicit key-value pairs
  return filtered.map((gameserver: QueryGameserver) => ({
    Name: gameserver.name,
    Game: gameserver.game?.name || 'Unknown',
    Region: gameserver.region || 'Unknown',
    Created: gameserver.created_at,
    Container: gameserver.container,
    // Keep the original object to use when emitting events
    _original: {
      ...gameserver,
      game_name: gameserver.game?.name,
    },
  }))
})

const totalCount = computed(() => gameservers.value.length)
const filteredCount = computed(() => filteredData.value.length)
const isFiltered = computed(() => filteredCount.value !== totalCount.value)

const adminTablePerPage = inject<Ref<number>>('adminTablePerPage', computed(() => 10))

// Table configuration
const { headers, rows, pagination, setPage, setSort, options } = defineTable(filteredData, {
  pagination: {
    enabled: true,
    perPage: adminTablePerPage.value,
  },
  select: false,
})

watch(adminTablePerPage, (perPage) => {
  options.value.pagination.perPage = perPage
  setPage(1)
})

// Set default sorting.
setSort('Name', 'asc')

// Fetch game servers data
async function fetchGameservers() {
  loading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await gameserversQuery

    if (error) {
      throw error
    }

    gameservers.value = data || []
    // Increment the refresh signal to notify the parent
    refreshSignal.value = (refreshSignal.value || 0) + 1
  }
  catch (error: unknown) {
    errorMessage.value = (error as Error).message || 'An error occurred while loading game servers'
  }
  finally {
    loading.value = false
  }
}

// Handle row click - View game server details
function viewGameserver(gameserver: QueryGameserver) {
  selectedGameserver.value = gameserver
  showGameserverDetails.value = true
}

function openGameserverById(gameserverId: number | null): boolean {
  if (gameserverId === null)
    return false

  const match = gameservers.value.find((gameserver: QueryGameserver) => gameserver.id === gameserverId)

  if (!match)
    return false

  viewGameserver(match)
  return true
}

// Open the add game server form
function openAddGameserverForm() {
  selectedGameserver.value = null
  isEditMode.value = false
  showGameserverForm.value = true
}

// Open the edit game server form
function openEditGameserverForm(gameserver: QueryGameserver, event?: Event) {
  // Prevent the click from triggering the view details
  if (event)
    event.stopPropagation()

  selectedGameserver.value = gameserver
  isEditMode.value = true
  showGameserverForm.value = true
}

// Handle edit from GameserverDetails
function handleEditFromDetails(gameserver: QueryGameserver) {
  openEditGameserverForm(gameserver)
}

// Handle game server save (both create and update)
async function handleGameserverSave(gameserverData: TablesInsert<'gameservers'> | TablesUpdate<'gameservers'>) {
  try {
    if (isEditMode.value && selectedGameserver.value) {
      // Update existing gameserver
      const updateData = {
        ...gameserverData,
        modified_at: new Date().toISOString(),
        modified_by: userId.value ?? null,
      }

      const { error } = await supabase
        .from('gameservers')
        .update(updateData)
        .eq('id', selectedGameserver.value.id)

      if (error)
        throw error
    }
    else {
      // Create new gameserver with creation and modification tracking
      const createData = {
        ...gameserverData,
        created_by: userId.value ?? null,
        modified_by: userId.value ?? null,
        modified_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('gameservers')
        .insert(createData as TablesInsert<'gameservers'>)

      if (error)
        throw error
    }

    // Refresh game servers data and close form
    showGameserverForm.value = false
    await fetchGameservers()
  }
  catch (error: unknown) {
    errorMessage.value = (error as Error).message || 'An error occurred while saving the game server'
  }
}

// Handle game server deletion
async function handleGameserverDelete(gameserverId: number) {
  try {
    const { error } = await supabase
      .from('gameservers')
      .delete()
      .eq('id', gameserverId)

    if (error)
      throw error

    showGameserverForm.value = false
    await fetchGameservers()
  }
  catch (error: unknown) {
    errorMessage.value = (error as Error).message || 'An error occurred while deleting the game server'
  }
}

// Clear all filters
function clearFilters() {
  search.value = ''
  regionFilter.value = undefined
  gameFilter.value = undefined
}

// Sync gameserver query params with details sheet state
watch(showGameserverDetails, (isOpen) => {
  if (isOpen && selectedGameserver.value) {
    const nextQuery = {
      ...route.query,
      tab: 'Gameservers',
      gameserver: selectedGameserver.value.id,
    }
    router.replace({ query: nextQuery })
    return
  }
  if (isOpen)
    return
  if (!route.query.gameserver)
    return
  const { gameserver, ...rest } = route.query
  router.replace({ query: rest })
})

watch(
  () => [focusedGameserverId.value, loading.value] as const,
  ([gameserverId, isLoading]) => {
    if (isLoading)
      return
    if (gameserverId === null)
      return
    openGameserverById(gameserverId)
  },
  { immediate: true },
)

// Lifecycle hooks
onBeforeMount(fetchGameservers)
</script>

<template>
  <!-- Error message -->
  <Alert v-if="errorMessage" variant="danger">
    {{ errorMessage }}
  </Alert>

  <!-- Loading state -->
  <template v-else-if="loading">
    <Flex gap="s" column expand>
      <!-- Header and filters -->
      <Flex :column="isBelowMedium" :x-between="!isBelowMedium" :x-start="isBelowMedium" y-center gap="s" expand>
        <GameserverFilters
          v-model:search="search"
          v-model:region-filter="regionFilter"
          v-model:game-filter="gameFilter"
          :region-options="regionOptions"
          :game-options="gameOptions"
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
          <span class="text-color-lighter text-s" :class="{ 'text-center': isBelowMedium }">Total —</span>

          <Button v-if="canCreate" variant="accent" :expand="isBelowMedium" @click="openAddGameserverForm">
            <template #start>
              <Icon name="ph:plus" />
            </template>
            Add Game Server
          </Button>
        </Flex>
      </Flex>

      <!-- Table skeleton -->
      <TableSkeleton
        :columns="5"
        :rows="10"
        :show-actions="canManageResource"
      />
    </Flex>
  </template>

  <Flex v-else gap="s" column expand>
    <!-- Header and filters -->
    <Flex :column="isBelowMedium" :x-between="!isBelowMedium" :x-start="isBelowMedium" y-center gap="s" expand>
      <GameserverFilters
        v-model:search="search"
        v-model:region-filter="regionFilter"
        v-model:game-filter="gameFilter"
        :region-options="regionOptions"
        :game-options="gameOptions"
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
          <Table.Head v-for="header in headers.filter(header => header.label !== '_original')" :key="header.label" sort :header />
          <Table.Head
            v-if="canManageResource"
            key="actions" :header="{ label: 'Actions',
                                     sortToggle: () => {} }"
          />
        </template>

        <template #body>
          <tr v-for="gameserver in rows" :key="gameserver._original.id" class="clickable-row" @click="viewGameserver(gameserver._original as QueryGameserver)">
            <Table.Cell>{{ gameserver.Name }}</Table.Cell>
            <Table.Cell>{{ gameserver.Game }}</Table.Cell>
            <Table.Cell>
              <RegionIndicator :region="gameserver._original.region" show-label />
            </Table.Cell>
            <Table.Cell>
              <TimestampDate :date="gameserver.Created" />
            </Table.Cell>
            <Table.Cell>
              {{ gameserver.Container || '—' }}
            </Table.Cell>
            <Table.Cell v-if="canManageResource" @click.stop>
              <AdminActions
                resource-type="gameservers"
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
                @edit="(gameserverItem) => openEditGameserverForm(gameserverItem as QueryGameserver)"
                @delete="(gameserverItem) => handleGameserverDelete((gameserverItem as QueryGameserver).id)"
              />
            </Table.Cell>
          </tr>
        </template>

        <template v-if="filteredData.length > adminTablePerPage" #pagination>
          <Pagination :pagination="pagination" @change="setPage" />
        </template>
      </Table.Root>
    </TableContainer>

    <!-- No results message -->
    <Flex v-if="!loading && (!rows || rows.length === 0)" expand>
      <Alert variant="info" class="w-100">
        No game servers found
      </Alert>
    </Flex>
  </Flex>

  <!-- Game Server Detail Sheet -->
  <GameserverDetails
    v-model:is-open="showGameserverDetails"
    :gameserver="selectedGameserver"
    @edit="handleEditFromDetails"
  />

  <!-- Game Server Form Sheet (for both create and edit) -->
  <GameserverForm
    v-model:is-open="showGameserverForm"
    :gameserver="selectedGameserver"
    :is-edit-mode="isEditMode"
    @save="handleGameserverSave"
    @delete="handleGameserverDelete"
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
