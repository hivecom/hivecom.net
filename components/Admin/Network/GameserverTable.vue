<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'

import { Alert, defineTable, Flex, Pagination, Table } from '@dolanske/vui'
import RegionIndicator from '@/components/Shared/RegionIndicator.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'

import GameserverDetails from './GameserverDetails.vue'
import GameserverFilters from './GameserverFilters.vue'

// Define interface for transformed gameserver data
interface TransformedGameserver {
  ID: number
  Name: string
  Game: string | null
  Region: string | null
  Created: string
  _original: {
    id: number
    name: string
    description: string | null
    markdown: string | null
    region: 'eu' | 'na' | 'all' | null
    addresses: string[] | null
    port: string | null
    container: string | null
    game: number | null
    admininstrator: string | null
    created_at: string
    created_by: string | null
    modified_at: string | null
    modified_by: string | null
    game_name?: string | null
  }
}

// Define interface for Select options
interface SelectOption {
  label: string
  value: string
}

// Define model value for refresh signal to parent
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

// Define query
const supabase = useSupabaseClient()
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

// Gameserver detail state
const selectedGameserver = ref<any>(null)
const showGameserverDetails = ref(false)

// Filter options
const regionOptions: SelectOption[] = [
  { label: 'Europe', value: 'eu' },
  { label: 'North America', value: 'na' },
  { label: 'All Regions', value: 'all' },
]

// Compute unique game options for the filter
const gameOptions = computed<SelectOption[]>(() => {
  const uniqueGames = new Map<number, string>()
  gameservers.value.forEach((gameserver) => {
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
  const filtered = gameservers.value.filter((item) => {
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
    if (regionFilter.value && item.region) {
      const regionFilterValue = regionFilter.value[0].value
      if (item.region !== regionFilterValue) {
        return false
      }
    }

    // Filter by game
    if (gameFilter.value && item.game) {
      const gameFilterValue = Number.parseInt(gameFilter.value[0].value)
      if (item.game.id !== gameFilterValue) {
        return false
      }
    }

    return true
  })

  // Transform the data into explicit key-value pairs
  return filtered.map(gameserver => ({
    ID: gameserver.id,
    Name: gameserver.name,
    Game: gameserver.game?.name || 'Unknown',
    Region: gameserver.region || 'Unknown',
    Created: gameserver.created_at,
    // Keep the original object to use when emitting events
    _original: {
      ...gameserver,
      game_name: gameserver.game?.name,
    },
  }))
})

// Table configuration
const { headers, rows, pagination, setPage, setSort } = defineTable(filteredData, {
  pagination: {
    enabled: true,
    perPage: 10,
  },
  select: false,
})

// Set default sorting.
setSort('Name', 'asc')

// Fetch gameservers data
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
  catch (error: any) {
    errorMessage.value = error.message || 'An error occurred while loading gameservers'
  }
  finally {
    loading.value = false
  }
}

// Handle row click - View gameserver details
function viewGameserver(gameserver: any) {
  selectedGameserver.value = gameserver
  showGameserverDetails.value = true
}

// Clear all filters
function clearFilters() {
  search.value = ''
  regionFilter.value = undefined
  gameFilter.value = undefined
}

// Lifecycle hooks
onBeforeMount(fetchGameservers)
</script>

<template>
  <!-- Error message -->
  <Alert v-if="errorMessage" variant="danger">
    {{ errorMessage }}
  </Alert>

  <!-- Loading state -->
  <Alert v-else-if="loading" variant="info">
    Loading gameservers...
  </Alert>

  <Flex v-else gap="s" column expand>
    <!-- Search and Filters -->
    <GameserverFilters
      v-model:search="search"
      v-model:region-filter="regionFilter"
      v-model:game-filter="gameFilter"
      :region-options="regionOptions"
      :game-options="gameOptions"
      @clear-filters="clearFilters"
    />

    <!-- Properly structured table -->
    <Table.Root v-if="rows && rows.length > 0" separate-cells :loading="loading" class="mb-l">
      <template #header>
        <Table.Head v-for="header in headers.filter(header => header.label !== '_original')" :key="header.label" sort :header />
      </template>

      <template #body>
        <tr v-for="gameserver in rows" :key="gameserver._original.id" class="clickable-row" @click="viewGameserver(gameserver._original)">
          <Table.Cell>{{ gameserver.ID }}</Table.Cell>
          <Table.Cell>{{ gameserver.Name }}</Table.Cell>
          <Table.Cell>{{ gameserver.Game }}</Table.Cell>
          <Table.Cell>
            <RegionIndicator :region="gameserver._original.region" show-label />
          </Table.Cell>
          <Table.Cell>
            <TimestampDate :date="gameserver.Created" />
          </Table.Cell>
        </tr>
      </template>

      <template v-if="filteredData.length > 10" #pagination>
        <Pagination :pagination="pagination" @change="setPage" />
      </template>
    </Table.Root>

    <!-- No results message -->
    <Flex v-if="!loading && (!rows || rows.length === 0)" expand>
      <Alert variant="info" class="w-100">
        No gameservers found
      </Alert>
    </Flex>
  </Flex>

  <!-- Gameserver Detail Sheet -->
  <GameserverDetails
    v-model:is-open="showGameserverDetails"
    :gameserver="selectedGameserver"
  />
</template>

<style scoped>
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
