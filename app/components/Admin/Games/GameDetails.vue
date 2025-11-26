<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Card, Flex, Grid, Sheet, Skeleton } from '@dolanske/vui'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import Metadata from '@/components/Shared/Metadata.vue'
import SteamLink from '@/components/Shared/SteamLink.vue'

const props = defineProps<{
  game: Tables<'games'> | null
}>()

// Define emits
const emit = defineEmits(['edit', 'delete'])

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// Handle closing the sheet
function handleClose() {
  isOpen.value = false
}

// Handle edit action from AdminActions
function handleEdit(item: Record<string, unknown>) {
  emit('edit', item as Tables<'games'>)
  isOpen.value = false
}

// Handle delete action from AdminActions
function handleDelete(item: Record<string, unknown>) {
  emit('delete', item as Tables<'games'>)
  isOpen.value = false
}

// Gameservers data fetching
const supabase = useSupabaseClient()
const gameserversLoading = ref(false)
const gameserversError = ref('')

// Game assets composable
const { getGameIconUrl, getGameCoverUrl, getGameBackgroundUrl } = useGameAssets()

interface GameServerWithContainer {
  id: number
  name: string
  description: string | null
  region: 'eu' | 'na' | 'all' | null
  addresses: string[] | null
  port: string | null
  created_at: string
  container: {
    name: string
    running: boolean
    healthy: boolean | null
  } | null
}

const gameservers = ref<GameServerWithContainer[]>([])

// Game assets state
const assetsLoading = ref(false)
const assetsUrl = ref({
  icon: null as string | null,
  cover: null as string | null,
  background: null as string | null,
})

// Fetch gameservers and assets when game changes
watchEffect(async () => {
  if (!props.game?.id) {
    gameservers.value = []
    assetsUrl.value = {
      icon: null,
      cover: null,
      background: null,
    }
    return
  }

  // Load gameservers
  gameserversLoading.value = true
  gameserversError.value = ''

  // Load assets if shorthand exists
  if (props.game.shorthand) {
    assetsLoading.value = true

    // Load all assets in parallel using the composable
    const [iconUrl, coverUrl, backgroundUrl] = await Promise.all([
      getGameIconUrl(props.game),
      getGameCoverUrl(props.game),
      getGameBackgroundUrl(props.game),
    ])

    assetsUrl.value = {
      icon: iconUrl,
      cover: coverUrl,
      background: backgroundUrl,
    }

    assetsLoading.value = false
  }
  else {
    assetsUrl.value = {
      icon: null,
      cover: null,
      background: null,
    }
  }

  try {
    // Create a fresh query each time to avoid caching issues
    const { data, error } = await supabase
      .from('gameservers')
      .select(`
        id,
        name,
        description,
        region,
        addresses,
        port,
        created_at,
        container!left (
          name,
          running,
          healthy
        )
      `)
      .eq('game', props.game.id)

    if (error) {
      throw error
    }

    gameservers.value = (data as GameServerWithContainer[]) || []
  }
  catch (error: unknown) {
    gameserversError.value = error instanceof Error ? error.message : 'Failed to load gameservers'
  }
  finally {
    gameserversLoading.value = false
  }
})
</script>

<template>
  <Sheet
    :open="!!props.game && isOpen"
    position="right"
    separator
    :size="600"
    @close="handleClose"
  >
    <template #header>
      <Flex x-between y-center>
        <Flex column :gap="0">
          <h4>Game Details</h4>
          <span v-if="props.game" class="text-color-light text-xxs">
            {{ props.game.name }}
          </span>
        </Flex>
        <Flex y-center gap="s">
          <AdminActions
            v-if="props.game"
            resource-type="games"
            :item="props.game"
            :show-labels="true"
            @edit="handleEdit"
            @delete="handleDelete"
          />
        </Flex>
      </Flex>
    </template>

    <Flex v-if="props.game" column gap="m" expand class="game-details">
      <Flex column gap="l" expand>
        <!-- Basic info -->
        <Card>
          <Flex column gap="l" expand>
            <Grid class="game-details__item" expand :columns="2">
              <span class="game-details__label">ID:</span>
              <span>{{ props.game.id }}</span>
            </Grid>

            <Grid class="game-details__item" expand :columns="2">
              <span class="game-details__label">Name:</span>
              <span>{{ props.game.name }}</span>
            </Grid>

            <Grid v-if="props.game.shorthand" class="game-details__item" expand :columns="2">
              <span class="game-details__label">Shorthand:</span>
              <span>{{ props.game.shorthand }}</span>
            </Grid>

            <Grid v-if="props.game.steam_id" class="game-details__item" expand :columns="2" y-center>
              <span class="game-details__label">Steam ID:</span>
              <SteamLink :steam-id="props.game.steam_id" show-icon />
            </Grid>

            <Grid v-if="props.game.website" class="game-details__item" expand :columns="2">
              <span class="game-details__label">Website:</span>
              <NuxtLink
                :to="props.game.website"
                class="game-details__link"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ props.game.website }}
              </NuxtLink>
            </Grid>
          </Flex>
        </Card>

        <!-- Related Game Servers -->
        <Card separators>
          <template #header>
            <h6>Related Game Servers</h6>
          </template>

          <!-- Loading state -->
          <Flex v-if="gameserversLoading" column gap="s" expand>
            <Flex v-for="i in 3" :key="i" class="game-details__gameserver-item" expand>
              <Flex y-center x-between gap="m" expand>
                <Skeleton :width="120" :height="16" :radius="4" />
                <Skeleton :width="80" :height="20" :radius="8" />
              </Flex>
            </Flex>
          </Flex>

          <!-- Error state -->
          <div v-else-if="gameserversError" class="game-details__placeholder-text game-details__placeholder-text--error">
            Error: {{ gameserversError }}
          </div>

          <!-- No gameservers -->
          <div v-else-if="gameservers.length === 0" class="game-details__placeholder-text">
            No gameservers are currently using this game.
          </div>

          <!-- Gameservers list -->
          <Flex v-else column gap="s" expand>
            <Flex v-for="gameserver in gameservers" :key="gameserver.id" class="game-details__gameserver-item" expand>
              <Flex y-center x-between gap="m" expand>
                <span class="game-details__gameserver-name">{{ gameserver.name }}</span>

                <!-- Addresses -->
                <Flex v-if="gameserver.addresses && gameserver.addresses.length > 0" y-center gap="xs">
                  <span v-for="address in gameserver.addresses.slice(0, 1)" :key="address" class="game-details__gameserver-address">
                    {{ address }}{{ gameserver.port ? `:${gameserver.port}` : '' }}
                  </span>
                  <span v-if="gameserver.addresses.length > 1" class="game-details__address-count">
                    +{{ gameserver.addresses.length - 1 }} more
                  </span>
                </Flex>
              </Flex>
            </Flex>
          </Flex>
        </Card>

        <!-- Game Assets -->
        <Card v-if="props.game.shorthand" separators>
          <template #header>
            <h6>Game Assets</h6>
          </template>

          <!-- Loading state -->
          <Flex v-if="assetsLoading" column gap="m" expand>
            <!-- Game Icon Skeleton -->
            <Flex column gap="s" expand>
              <Skeleton :width="32" :height="14" :radius="4" />
              <Skeleton :width="64" :height="64" :radius="8" />
            </Flex>

            <!-- Game Cover Skeleton -->
            <Flex column gap="s" expand>
              <Skeleton :width="40" :height="14" :radius="4" />
              <Skeleton :width="133" :height="200" :radius="8" />
            </Flex>

            <!-- Game Background Skeleton -->
            <Flex column gap="s" expand>
              <Skeleton :width="70" :height="14" :radius="4" />
              <Skeleton :height="108" :radius="8" />
            </Flex>
          </Flex>

          <!-- Assets display -->
          <Flex v-else column gap="m" expand>
            <!-- Game Icon -->
            <Flex column gap="s" expand>
              <span class="game-details__asset-label">Icon</span>
              <Flex v-if="assetsUrl.icon" y-center>
                <img
                  :src="assetsUrl.icon"
                  alt="Game Icon"
                  class="game-details__asset-image game-details__asset-image--icon"
                >
              </Flex>
              <span v-else class="game-details__asset-missing">No icon uploaded</span>
            </Flex>

            <!-- Game Cover -->
            <Flex column gap="s" expand>
              <span class="game-details__asset-label">Cover</span>
              <Flex v-if="assetsUrl.cover" y-center expand>
                <img
                  :src="assetsUrl.cover"
                  alt="Game Cover"
                  class="game-details__asset-image game-details__asset-image--cover"
                >
              </Flex>
              <span v-else class="game-details__asset-missing">No cover uploaded</span>
            </Flex>

            <!-- Game Background -->
            <Flex column gap="s" expand>
              <span class="game-details__asset-label">Background</span>
              <Flex v-if="assetsUrl.background" y-center>
                <img
                  :src="assetsUrl.background"
                  alt="Game Background"
                  class="game-details__asset-image game-details__asset-image--background"
                >
              </Flex>
              <span v-else class="game-details__asset-missing">No background uploaded</span>
            </Flex>
          </Flex>
        </Card>

        <!-- No shorthand notice -->
        <Card v-else-if="props.game">
          <Flex y-center gap="s" class="game-details__placeholder-text">
            <Icon name="ph:info" />
            <span>Game assets are not available because this game has no shorthand assigned.</span>
          </Flex>
        </Card>

        <!-- Metadata -->
        <Metadata
          :created-at="props.game.created_at"
          :created-by="props.game.created_by"
          :modified-at="props.game.modified_at"
          :modified-by="props.game.modified_by"
        />
      </Flex>
    </Flex>
  </Sheet>
</template>

<style lang="scss" scoped>
.game-details {
  padding-bottom: var(--space);

  &__label {
    font-weight: var(--font-weight-medium);
    color: var(--color-text-light);
  }

  &__link {
    color: var(--color-text-blue);
    word-break: break-all;
  }

  &__metadata-by {
    font-size: var(--font-size-l);
    color: var(--color-text-light);
  }

  &__placeholder-text {
    color: var(--color-text-light);
    font-style: italic;

    &--error {
      color: var(--color-text-red);
    }
  }

  &__gameserver-item {
    width: 100%;
    padding: var(--space-s);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-s);
    background-color: var(--color-bg);
  }

  &__gameserver-name {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    color: var(--color-text);
  }

  &__gameserver-description {
    font-size: var(--font-size-s);
    color: var(--color-text-light);
    margin: 0;
  }

  &__gameserver-address {
    font-family: monospace;
    font-size: var(--font-size-xs);
    color: var(--color-text-light);
    background-color: var(--color-bg-raised);
    padding: var(--space-xs) var(--space-s);
    border-radius: var(--border-radius-s);
  }

  &__address-count {
    font-size: var(--font-size-s);
    color: var(--color-text-light);
  }

  &__asset-label {
    font-size: var(--font-size-s);
    font-weight: var(--font-weight-medium);
    color: var(--color-text);
  }

  &__asset-image {
    width: 100%;
    border-radius: var(--border-radius-s);
    border: 1px solid var(--color-border);
    background-color: var(--color-bg-subtle);
    object-fit: cover;

    &--icon {
      width: 64px;
      height: 64px;
    }

    &--cover {
      aspect-ratio: 600 / 900;
      max-width: 200px;
    }
  }

  &__asset-missing {
    font-size: var(--font-size-s);
    color: var(--color-text-light);
    font-style: italic;
  }

  &__status-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;

    &--healthy {
      background-color: var(--color-text-green);
    }

    &--unhealthy {
      background-color: var(--color-text-orange);
    }

    &--offline {
      background-color: var(--color-text-red);
    }

    &--unknown {
      background-color: var(--color-text-light);
    }
  }
}
</style>
