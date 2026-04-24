<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'
import type { TablesInsert, TablesUpdate } from '@/types/database.overrides'
import { Alert, Button, defineTable, Flex, Pagination, Table } from '@dolanske/vui'
import { computed, watch } from 'vue'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import RegionIndicator from '@/components/Shared/RegionIndicator.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { useAdminCrudTable } from '@/composables/useAdminCrudTable'
import { useDiscussionSubscriptionsCache } from '@/composables/useDiscussionSubscriptionsCache'
import { useBreakpoint } from '@/lib/mediaQuery'
import GameserverDetails from './GameServerDetails.vue'
import GameserverFilters from './GameServerFilters.vue'
import GameserverForm from './GameServerForm.vue'

const supabase = useSupabaseClient()
const userId = useUserId()
const subscriptionsCache = useDiscussionSubscriptionsCache()
const route = useRoute()
const router = useRouter()
const isBelowMedium = useBreakpoint('<m')

const gameserversQuery = supabase.from('gameservers').select(`
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
  Created: string
  Container: string | null
}

// Filter states kept local - region/game filters go beyond simple search
const regionFilter = ref<SelectOption[]>()
const gameFilter = ref<SelectOption[]>()

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
  resourceType: 'gameservers',
  // URL param sync handled manually below (also needs to set tab= param)
  queryParamKey: false,
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
    Created: gameserver.created_at,
    Container: gameserver.container,
  }),
  defaultSort: { column: 'Name', direction: 'asc' },
})

// Compute game options from loaded data
const gameOptions = computed<SelectOption[]>(() => {
  const uniqueGames = new Map<number, string>()
  gameservers.value.forEach((gs) => {
    if (gs.game?.name) {
      uniqueGames.set(gs.game.id, gs.game.name)
    }
  })
  return Array.from(uniqueGames.entries(), ([id, name]) => ({
    label: name,
    value: id.toString(),
  }))
})

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
      const gameFilterVal = Number.parseInt(gameFilter.value[0]?.value ?? '0')
      if (row._original.game.id !== gameFilterVal)
        return false
    }

    return true
  })
})

const filteredCount = computed(() => filteredData.value.length)
const isFiltered = computed(() => filteredCount.value !== totalCount.value)

const { headers, rows, pagination, setPage, setSort, options } = defineTable(filteredData, {
  pagination: { enabled: true, perPage: adminTablePerPage.value },
  select: false,
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

async function handleGameserverSave(gameserverData: TablesInsert<'gameservers'> | TablesUpdate<'gameservers'>) {
  try {
    if (isEditMode.value && selectedGameserver.value) {
      const { error } = await supabase
        .from('gameservers')
        .update({
          ...gameserverData,
          modified_at: new Date().toISOString(),
          modified_by: userId.value ?? null,
        })
        .eq('id', selectedGameserver.value.id)
      if (error)
        throw error
    }
    else {
      const { error } = await supabase
        .from('gameservers')
        .insert({
          ...gameserverData,
          created_by: userId.value ?? null,
          modified_by: userId.value ?? null,
          modified_at: new Date().toISOString(),
        } as TablesInsert<'gameservers'>)
      if (error)
        throw error

      if (userId.value)
        subscriptionsCache.invalidateList(userId.value)
    }

    showGameserverForm.value = false
    await fetchGameservers()
  }
  catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'An error occurred while saving the game server'
  }
}

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
  catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'An error occurred while deleting the game server'
  }
}

function clearFilters() {
  search.value = ''
  regionFilter.value = undefined
  gameFilter.value = undefined
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
          <Table.Head v-for="header in headers.filter(h => h.label !== '_original')" :key="header.label" sort :header />
          <Table.Head
            v-if="canManageResource"
            key="actions"
            :header="{ label: 'Actions',
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
              {{ gameserver.Container || '-' }}
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
                @edit="(item) => openEditGameserverForm(item as QueryGameserver)"
                @delete="(item) => handleGameserverDelete((item as QueryGameserver).id)"
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
    @delete="handleGameserverDelete"
  />

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
