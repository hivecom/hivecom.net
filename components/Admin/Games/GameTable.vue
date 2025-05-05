<script setup lang="ts">
import { Alert, Button, defineTable, Flex, Pagination, Table } from '@dolanske/vui'
import { computed, onBeforeMount, ref } from 'vue'

import GameDetails from './GameDetails.vue'
import GameFilters from './GameFilters.vue'
import GameForm from './GameForm.vue'

// Game table type
interface Game {
  id: number
  name: string
  shorthand: string | null
  steam_id: number | null
  created_at: string
  created_by: string | null
}

// Define transformed game data interface
interface TransformedGame {
  'Name': string
  'Shorthand': string | null
  'Steam ID': number | null
  '_original': Game
}

// Define model value for refresh signal to parent
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

// Setup client and state
const supabase = useSupabaseClient()
const loading = ref(true)
const errorMessage = ref('')
const games = ref<Game[]>([])
const search = ref('')

// Game details state
const showGameDetails = ref(false)
const showGameForm = ref(false)
const selectedGame = ref<Game | null>(null)
const isEditMode = ref(false)

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

// Table configuration
const { headers, rows, pagination, setPage, setSort } = defineTable(transformedGames, {
  pagination: {
    enabled: true,
    perPage: 10,
  },
  select: false,
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
      .select('*')
      .order('name')

    if (error)
      throw error

    games.value = data as Game[] || []
    // Increment the refresh signal to notify the parent
    refreshSignal.value = (refreshSignal.value || 0) + 1
  }
  catch (error: any) {
    errorMessage.value = error.message || 'An error occurred while loading games'
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

// Handle game save (both create and update)
async function handleGameSave(gameData: Partial<Game>) {
  try {
    if (isEditMode.value && selectedGame.value) {
      // Update existing game
      const { error } = await supabase
        .from('games')
        .update(gameData)
        .eq('id', selectedGame.value.id)

      if (error)
        throw error
    }
    else {
      // Create new game
      const { error } = await supabase
        .from('games')
        .insert(gameData)

      if (error)
        throw error
    }

    // Refresh games data and close form
    showGameForm.value = false
    await fetchGames()
  }
  catch (error: any) {
    errorMessage.value = error.message || 'An error occurred while saving the game'
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
  catch (error: any) {
    errorMessage.value = error.message || 'An error occurred while deleting the game'
  }
}

// Lifecycle hooks
onBeforeMount(fetchGames)
</script>

<template>
  <!-- Error message -->
  <Alert v-if="errorMessage" variant="danger">
    {{ errorMessage }}
  </Alert>

  <!-- Loading state -->
  <Alert v-else-if="loading" variant="info">
    Loading games...
  </Alert>

  <Flex v-else gap="s" column expand>
    <!-- Header and filters -->
    <Flex x-between expand>
      <GameFilters v-model:search="search" />

      <Button variant="accent" @click="openAddGameForm">
        <template #start>
          <Icon name="ph:plus" />
        </template>
        Add Game
      </Button>
    </Flex>

    <!-- Table -->
    <Table.Root v-if="rows.length > 0" separate-cells :loading="loading" class="mb-l">
      <template #header>
        <Table.Head v-for="header in headers.filter(header => header.label !== '_original')" :key="header.label" sort :header />
        <Table.Head key="actions" :header="{ label: 'Actions', sortToggle: () => {} }" />
      </template>

      <template #body>
        <tr v-for="game in rows" :key="game._original.id" class="clickable-row" @click="viewGameDetails(game._original)">
          <Table.Cell>{{ game.Name }}</Table.Cell>
          <Table.Cell>{{ game.Shorthand || '-' }}</Table.Cell>
          <Table.Cell>{{ game['Steam ID'] || '-' }}</Table.Cell>
          <Table.Cell @click.stop>
            <Flex gap="xs">
              <Button small icon="ph:pencil" @click="(event) => openEditGameForm(game._original, event)">
                Edit
              </Button>
            </Flex>
          </Table.Cell>
        </tr>
      </template>

      <template v-if="transformedGames.length > 10" #pagination>
        <Pagination :pagination="pagination" @change="setPage" />
      </template>
    </Table.Root>

    <!-- No results message -->
    <Alert v-else-if="!loading" variant="info">
      No games found
    </Alert>

    <!-- Game Detail Sheet -->
    <GameDetails
      v-model:is-open="showGameDetails"
      :game="selectedGame"
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

<style scoped>
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
