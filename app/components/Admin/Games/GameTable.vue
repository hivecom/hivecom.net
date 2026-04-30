<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Alert, Badge, Button, defineTable, Flex, Pagination, Table } from '@dolanske/vui'
import { watch } from 'vue'

import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import GameIcon from '@/components/GameServers/GameIcon.vue'
import SteamLink from '@/components/Shared/SteamLink.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import { useAdminCrudTable } from '@/composables/useAdminCrudTable'
import { invalidateGamesCache } from '@/composables/useDataGames'
import { useBreakpoint } from '@/lib/mediaQuery'
import GameDetails from './GameDetails.vue'
import GameFilters from './GameFilters.vue'
import GameForm from './GameForm.vue'

const WHITESPACE_RE = /\s+/g

type Game = Tables<'games'>

const supabase = useSupabaseClient()
const userId = useUserId()

const {
  items: _games,
  loading,
  errorMessage,
  filteredRows,
  totalCount,
  filteredCount,
  isFiltered,
  search,
  selectedItem: selectedGame,
  showDetails: showGameDetails,
  showForm: showGameForm,
  isEditMode,
  canManageResource,
  canCreate,
  adminTablePerPage,
  viewItem: viewGameDetails,
  openAdd: openAddGameForm,
  openEdit: openEditGameForm,
  handleEditFromDetails,
  refresh: fetchGames,
} = useAdminCrudTable<Game, { 'Name': string | null, 'Shorthand': string | null, 'Steam ID': number | null }>({
  resourceType: 'games',
  queryParamKey: 'game',
  fetch: async () => {
    const { data, error } = await supabase
      .from('games')
      .select('id, name, shorthand, steam_id, website, created_at, created_by, modified_at, modified_by')
      .order('name')
    if (error)
      throw error
    return (data as Game[]) || []
  },
  transform: game => ({
    'Name': game.name,
    'Shorthand': game.shorthand,
    'Steam ID': game.steam_id,
  }),
  defaultSort: { column: 'Name', direction: 'asc' },
})

const isBelowMedium = useBreakpoint('<m')

const { headers, rows, pagination, setPage, setSort, options } = defineTable(filteredRows, {
  pagination: { enabled: true, perPage: adminTablePerPage.value },
  select: false,
})

watch(adminTablePerPage, (perPage) => {
  options.value.pagination.perPage = perPage
  setPage(1)
})

setSort('Name', 'asc')

async function handleGameSave(gameData: Partial<Game>) {
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
</script>

<template>
  <!-- Error message -->
  <Alert v-if="errorMessage" variant="danger">
    {{ errorMessage }}
  </Alert>

  <!-- Loading state -->
  <template v-else-if="loading">
    <Flex gap="s" column expand>
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
          <span class="text-color-lighter text-s" :class="{ 'text-center': isBelowMedium }">Total -</span>

          <Button v-if="canCreate" variant="accent" :expand="isBelowMedium" @click="openAddGameForm">
            <template #start>
              <Icon name="ph:plus" />
            </template>
            Add Game
          </Button>
        </Flex>
      </Flex>

      <TableSkeleton :columns="3" :rows="10" :show-actions="canManageResource" />
    </Flex>
  </template>

  <Flex v-else gap="s" column expand>
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

    <TableContainer>
      <Table.Root v-if="rows.length > 0" separate-cells :loading="loading" class="mb-l">
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
                @edit="(item) => openEditGameForm(item as Game)"
                @delete="(item) => handleGameDelete((item as Game).id)"
              />
            </Table.Cell>
          </tr>
        </template>

        <template v-if="filteredRows.length > adminTablePerPage" #pagination>
          <Pagination :pagination="pagination" @change="setPage" />
        </template>
      </Table.Root>

      <Alert v-else-if="!loading" variant="info">
        No games found
      </Alert>
    </TableContainer>

    <GameDetails
      v-model:is-open="showGameDetails"
      :game="selectedGame"
      @edit="handleEditFromDetails"
      @delete="(item) => handleGameDelete(item.id)"
    />

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
