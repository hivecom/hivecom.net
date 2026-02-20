<script setup lang="ts">
import type { Ref } from 'vue'
import type { Tables } from '@/types/database.types'
import { Alert, Badge, Button, defineTable, Flex, Pagination, Table } from '@dolanske/vui'
import { computed, inject, onBeforeMount, ref, watch } from 'vue'

import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import GameIcon from '@/components/GameServers/GameIcon.vue'
import SteamLink from '@/components/Shared/SteamLink.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import { useBreakpoint } from '@/lib/mediaQuery'
import GameDetails from './GameDetails.vue'
import GameFilters from './GameFilters.vue'
import GameForm from './GameForm.vue'

// Game table type
type Game = Tables<'games'>

// Define transformed game data interface
interface TransformedGame {
  'Name': string | null
  'Shorthand': string | null
  'Steam ID': number | null
  '_original': Game
}

// Define model value for refresh signal to parent
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

// Get admin permissions
const { canManageResource, canCreate } = useTableActions('games')
const route = useRoute()
const router = useRouter()

// Setup client and state
const supabase = useSupabaseClient()
const userId = useUserId()
const loading = ref(true)
const errorMessage = ref('')
const games = ref<Game[]>([])
const search = ref('')

// Game details state
const showGameDetails = ref(false)
const showGameForm = ref(false)
const selectedGame = ref<Game | null>(null)
const isEditMode = ref(false)

const focusedGameId = computed(() => {
  const gameQuery = route.query.game
  const rawValue = typeof gameQuery === 'string'
    ? gameQuery
    : Array.isArray(gameQuery) && gameQuery[0]
      ? gameQuery[0]
      : ''
  const parsed = Number.parseInt(rawValue, 10)
  return Number.isNaN(parsed) ? null : parsed
})

const adminTablePerPage = inject<Ref<number>>('adminTablePerPage', computed(() => 10))

// Filtered and transformed games
const transformedGames = computed<TransformedGame[]>(() => {
  if (!search.value) {
    return games.value.map(game => ({
      'Name': game.name,
      'Shorthand': game.shorthand,
      'Steam ID': game.steam_id,
      '_original': game,
    }))
  }

  const searchTerm = search.value.toLowerCase()
  return games.value.filter(game =>
    game.name?.toLowerCase().includes(searchTerm)
    || game.shorthand?.toLowerCase().includes(searchTerm)
    || (game.steam_id && String(game.steam_id).includes(searchTerm)),
  ).map(game => ({
    'Name': game.name,
    'Shorthand': game.shorthand,
    'Steam ID': game.steam_id,
    '_original': game,
  }))
})

const totalCount = computed(() => games.value.length)
const filteredCount = computed(() => transformedGames.value.length)
const isFiltered = computed(() => Boolean(search.value))

const isBelowMedium = useBreakpoint('<m')

// Table configuration
const { headers, rows, pagination, setPage, setSort, options } = defineTable(transformedGames, {
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

// Set default sorting
setSort('Name', 'asc')

// Fetch games data
async function fetchGames() {
  loading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await supabase
      .from('games')
      .select('id, name, shorthand, steam_id, website, created_at, created_by, modified_at, modified_by')
      .order('name')

    if (error)
      throw error

    games.value = data as Game[] || []
    // Increment the refresh signal to notify the parent
    refreshSignal.value = (refreshSignal.value || 0) + 1
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'An error occurred while loading games'
  }
  finally {
    loading.value = false
  }
}

// View game details
function viewGameDetails(game: Game) {
  selectedGame.value = game
  showGameDetails.value = true
}

function openGameById(gameId: number | null): boolean {
  if (gameId === null)
    return false

  const match = games.value.find((game: Game) => game.id === gameId)

  if (!match)
    return false

  viewGameDetails(match)
  return true
}

// Open the add game form
function openAddGameForm() {
  selectedGame.value = null
  isEditMode.value = false
  showGameForm.value = true
}

// Open the edit game form
function openEditGameForm(game: Game, event?: Event) {
  // Prevent the click from triggering the view details
  if (event)
    event.stopPropagation()

  selectedGame.value = game
  isEditMode.value = true
  showGameForm.value = true
}

// Handle edit from GameDetails
function handleEditFromDetails(game: Game) {
  openEditGameForm(game)
}

// Handle game save (both create and update)
async function handleGameSave(gameData: Partial<Game>) {
  try {
    // Normalize shorthand: lowercase, no spaces, empty string becomes null
    const normalizedData = { ...gameData }
    if (normalizedData.shorthand !== undefined) {
      if (normalizedData.shorthand === null || normalizedData.shorthand === '') {
        normalizedData.shorthand = null
      }
      else {
        normalizedData.shorthand = normalizedData.shorthand.toLowerCase().replace(/\s+/g, '')
        if (normalizedData.shorthand === '') {
          normalizedData.shorthand = null
        }
      }
    }

    if (isEditMode.value && selectedGame.value) {
      // Update existing game with modification tracking
      const updateData = {
        ...normalizedData,
        modified_at: new Date().toISOString(),
        modified_by: userId.value ?? null,
      }

      const { error } = await supabase
        .from('games')
        .update(updateData)
        .eq('id', selectedGame.value.id)

      if (error)
        throw error
    }
    else {
      // Create new game with creation and modification tracking
      const createData = {
        ...normalizedData,
        created_by: userId.value ?? null,
        modified_by: userId.value ?? null,
        modified_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('games')
        .insert(createData)

      if (error)
        throw error
    }

    // Refresh games data and close form
    showGameForm.value = false
    await fetchGames()
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'An error occurred while saving the game'
  }
}

// Handle game deletion
async function handleGameDelete(gameId: number) {
  try {
    const { error } = await supabase
      .from('games')
      .delete()
      .eq('id', gameId)

    if (error)
      throw error

    showGameForm.value = false
    await fetchGames()
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'An error occurred while deleting the game'
  }
}

// Sync game query params with details sheet state
watch(showGameDetails, (isOpen) => {
  if (isOpen && selectedGame.value) {
    const nextQuery = {
      ...route.query,
      game: selectedGame.value.id,
    }
    router.replace({ query: nextQuery })
    return
  }
  if (isOpen)
    return
  if (!route.query.game)
    return
  const { game, ...rest } = route.query
  router.replace({ query: rest })
})

watch(
  () => [focusedGameId.value, loading.value] as const,
  ([gameId, isLoading]) => {
    if (isLoading)
      return
    if (gameId === null)
      return
    openGameById(gameId)
  },
  { immediate: true },
)

// Lifecycle hooks
onBeforeMount(fetchGames)
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
          <span class="text-color-lighter text-s" :class="{ 'text-center': isBelowMedium }">Total —</span>

          <Button v-if="canCreate" variant="accent" :expand="isBelowMedium" @click="openAddGameForm">
            <template #start>
              <Icon name="ph:plus" />
            </template>
            Add Game
          </Button>
        </Flex>
      </Flex>

      <!-- Table skeleton -->
      <TableSkeleton
        :columns="3"
        :rows="10"
        :show-actions="canManageResource"
      />
    </Flex>
  </template>

  <Flex v-else gap="s" column expand>
    <!-- Header and filters -->
    <Flex :column="isBelowMedium" :x-between="!isBelowMedium" :x-start="isBelowMedium" y-center gap="s" expand>
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
          {{ isFiltered ? `Filtered ${filteredCount}` : `Total ${totalCount}` }}
        </span>

        <Button v-if="canCreate" variant="accent" :expand="isBelowMedium" @click="openAddGameForm">
          <template #start>
            <Icon name="ph:plus" />
          </template>
          Add Game
        </Button>
      </Flex>
    </Flex>

    <!-- Table -->
    <TableContainer>
      <Table.Root v-if="rows.length > 0" separate-cells :loading="loading" class="mb-l">
        <template #header>
          <Table.Head v-for="header in headers.filter(header => header.label !== '_original')" :key="header.label" sort :header />
          <Table.Head
            v-if="canManageResource"
            key="actions" :header="{ label: 'Actions',
                                     sortToggle: () => {} }"
          />
        </template>

        <template #body>
          <tr v-for="game in rows" :key="game._original.id" class="clickable-row" @click="viewGameDetails(game._original)">
            <Table.Cell>
              <Flex gap="xs" y-center>
                <GameIcon :game="game._original" size="xs" />
                <span>{{ game.Name }}</span>
              </Flex>
            </Table.Cell>
            <Table.Cell>
              <Badge v-if="game.Shorthand" variant="accent">
                {{ game.Shorthand }}
              </Badge>
              <span v-else>-</span>
            </Table.Cell>
            <Table.Cell @click.stop>
              <SteamLink :steam-id="game['Steam ID']" size="small" />
            </Table.Cell>
            <Table.Cell v-if="canManageResource" @click.stop>
              <AdminActions
                resource-type="games"
                :item="game._original"
                button-size="s"
                @edit="(gameItem) => openEditGameForm(gameItem as Game)"
                @delete="(gameItem) => handleGameDelete((gameItem as Game).id)"
              />
            </Table.Cell>
          </tr>
        </template>

        <template v-if="transformedGames.length > adminTablePerPage" #pagination>
          <Pagination :pagination="pagination" @change="setPage" />
        </template>
      </Table.Root>

      <!-- No results message -->
      <Alert v-else-if="!loading" variant="info">
        No games found
      </Alert>
    </TableContainer>

    <!-- Game Detail Sheet -->
    <GameDetails
      v-model:is-open="showGameDetails"
      :game="selectedGame"
      @edit="handleEditFromDetails"
      @delete="(gameItem) => handleGameDelete(gameItem.id)"
    />

    <!-- Game Form Sheet (for both create and edit) -->
    <GameForm
      v-model:is-open="showGameForm"
      :game="selectedGame"
      :is-edit-mode="isEditMode"
      @save="handleGameSave"
      @delete="handleGameDelete"
    />
  </Flex>
</template>

<style scoped lang="scss">
.mb-l {
  margin-bottom: var(--space-l);
}
.clickable-row:hover {
  td {
    cursor: pointer;
    background-color: var(--color-bg-raised);
  }
}
td {
  vertical-align: middle;
}
</style>
