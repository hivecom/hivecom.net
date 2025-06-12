<script setup lang="ts">
import { Card, Flex, Grid, Sheet } from '@dolanske/vui'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import SteamLink from '@/components/Shared/SteamLink.vue'
import Metadata from '~/components/Shared/Metadata.vue'

const props = defineProps<{
  game: {
    id: number
    name: string
    shorthand: string | null
    steam_id: number | null
    created_at: string
    created_by: string | null
    modified_at: string | null
    modified_by: string | null
  } | null
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
function handleEdit(game: any) {
  emit('edit', game)
  isOpen.value = false
}

// Handle delete action from AdminActions
function handleDelete(game: any) {
  emit('delete', game)
  isOpen.value = false
}

// Gameservers data fetching
const supabase = useSupabaseClient()
const gameserversLoading = ref(false)
const gameserversError = ref('')
const gameservers = ref<any[]>([])

// Fetch gameservers when game changes
watchEffect(async () => {
  if (!props.game?.id) {
    gameservers.value = []
    return
  }

  gameserversLoading.value = true
  gameserversError.value = ''

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

    gameservers.value = data || []
  }
  catch (error: any) {
    gameserversError.value = error.message || 'Failed to load gameservers'
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
          <span v-if="props.game" class="color-text-light text-xxs">
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

    <Flex v-if="props.game" column gap="m" class="game-details">
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
          </Flex>
        </Card>

        <!-- Related Game Servers -->
        <Card separators>
          <template #header>
            <h6>Related Game Servers</h6>
          </template>

          <!-- Loading state -->
          <div v-if="gameserversLoading" class="game-details__placeholder-text">
            Loading game servers...
          </div>

          <!-- Error state -->
          <div v-else-if="gameserversError" class="game-details__placeholder-text game-details__placeholder-text--error">
            Error: {{ gameserversError }}
          </div>

          <!-- No gameservers -->
          <div v-else-if="gameservers.length === 0" class="game-details__placeholder-text">
            No gameservers are currently using this game.
          </div>

          <!-- Gameservers list -->
          <Flex v-else column gap="s">
            <div v-for="gameserver in gameservers" :key="gameserver.id" class="game-details__gameserver-item">
              <Flex y-center x-between gap="m">
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
            </div>
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
    font-weight: 500;
    color: var(--color-text-light);
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
    font-weight: 500;
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
