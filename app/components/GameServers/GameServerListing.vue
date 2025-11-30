<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'
import type { Tables } from '@/types/database.types'
import { Alert, Badge, Button, Card, Flex, Input, Select, Skeleton } from '@dolanske/vui'
import GameIcon from '@/components/GameServers/GameIcon.vue'
import GameServerRow from '@/components/GameServers/GameServerRow.vue'
import ErrorAlert from '@/components/Shared/ErrorAlert.vue'
import GameDetailsModalTrigger from '@/components/Shared/GameDetailsModalTrigger.vue'

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
// Define the type inline to match what the parent component provides
const supabase = useSupabaseClient()
const _gameserversQuery = supabase.from('gameservers').select(`
  *,
  container (
    name,
    running,
    healthy
  ),
  administrator
`)
type GameserversType = QueryData<typeof _gameserversQuery>

interface Props {
  games?: Tables<'games'>[]
  gameservers?: GameserversType
  loading: boolean
  errorMessage: string
  filteredGames: Tables<'games'>[]
  filteredGameservers: GameserversType
  gameserversWithoutGame: GameserversType
  search: string
  selectedGames?: { label: string, value: number }[]
  selectedRegions?: { label: string, value: string }[]
  gameOptions: { label: string, value: number }[]
  regionOptions: { label: string, value: string }[]
}

interface Emits {
  (e: 'update:search', value: string): void
  (e: 'update:selectedGames', value: { label: string, value: number }[] | undefined): void
  (e: 'update:selectedRegions', value: { label: string, value: string }[] | undefined): void
  (e: 'clearFilters'): void
}

function getServersByGameId(gameId: number) {
  return props.filteredGameservers?.filter((gameserver: GameserversType[0]) => gameserver.game === gameId) ?? []
}

function clearFilters() {
  emit('clearFilters')
}

function updateSearch(value: string | number) {
  emit('update:search', String(value))
}

function updateSelectedGames(value: { label: string, value: number }[] | undefined) {
  emit('update:selectedGames', value)
}

function updateSelectedRegions(value: { label: string, value: string }[] | undefined) {
  emit('update:selectedRegions', value)
}
</script>

<template>
  <div class="game-listing">
    <!-- Error message -->
    <template v-if="errorMessage">
      <ErrorAlert message="An error occurred while fetching game servers." :error="errorMessage" />
    </template>

    <!-- Loading skeletons -->
    <Flex v-if="loading" column>
      <Flex>
        <Skeleton :width="240" :height="32" :radius="8" />
        <Skeleton :width="120" :height="32" :radius="8" />
      </Flex>
      <template v-for="i in 6" :key="i">
        <Skeleton :height="48" :radius="8" />
      </template>
    </Flex>

    <template v-if="!loading && !errorMessage">
      <!-- Content -->
      <template v-if="games && gameservers && games.length !== 0 && gameservers.length !== 0">
        <!-- Inputs -->
        <Flex gap="s" x-start class="mb-m">
          <Input
            :model-value="search"
            placeholder="Search servers"
            @update:model-value="updateSearch"
          >
            <template #start>
              <Icon name="ph:magnifying-glass" />
            </template>
          </Input>
          <Select
            :model-value="selectedGames"
            :options="gameOptions"
            placeholder="Select game"
            @update:model-value="updateSelectedGames"
          />
          <Select
            :model-value="selectedRegions"
            :options="regionOptions"
            placeholder="Select region"
            @update:model-value="updateSelectedRegions"
          />
          <Button v-if="selectedGames || selectedRegions || search" plain outline @click="clearFilters">
            Clear
          </Button>
        </Flex>

        <Flex gap="m" column>
          <template v-for="game in filteredGames" :key="game.id">
            <Card v-if="getServersByGameId(game.id).length > 0">
              <h3 class="mb-s text-l">
                <Flex gap="m" y-center x-between>
                  <Flex gap="s" y-center>
                    <GameDetailsModalTrigger v-slot="{ open }" :game-id="game.id">
                      <button
                        type="button"
                        class="game-listing__game-icon-button"
                        :aria-label="`Open details for ${game.name ?? 'game'}`"
                        @click.stop="open"
                      >
                        <GameIcon :game="game" size="medium" />
                      </button>
                    </GameDetailsModalTrigger>
                    {{ game.name }}
                    <div class="counter">
                      {{ getServersByGameId(game.id).length }}
                    </div>
                  </Flex>
                  <!-- <SteamLink v-if="game.steam_id" :steam-id="game.steam_id" show-icon hide-id /> -->
                </Flex>
              </h3>
              <Flex column class="w-100">
                <GameServerRow
                  v-for="gameserver in getServersByGameId(game.id)" :key="gameserver.id"
                  :gameserver="(gameserver as Tables<'gameservers'>)"
                  :container="(gameserver.container as Tables<'containers'> | null)"
                  :game="(game as Tables<'games'>)"
                />
              </Flex>
            </Card>
          </template>

          <!-- Gameservers without a game -->
          <Card v-if="gameserversWithoutGame.length > 0">
            <h3 class="mb-s">
              <Flex gap="m" y-center>
                Unassigned Servers
                <Badge>
                  {{ gameserversWithoutGame.length }}
                </Badge>
              </Flex>
            </h3>
            <Flex column class="w-100">
              <GameServerRow
                v-for="gameserver in gameserversWithoutGame" :key="gameserver.id"
                :gameserver="(gameserver as any)"
                :container="(gameserver.container as any)"
                :game="undefined"
              />
            </Flex>
          </Card>
        </Flex>
      </template>
      <!-- No content -->
      <template v-else>
        <Alert variant="info">
          No game servers found.
        </Alert>
      </template>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.game-listing__game-icon-button {
  border: none;
  background: transparent;
  padding: 0;
  display: flex;
  cursor: pointer;
}
</style>
