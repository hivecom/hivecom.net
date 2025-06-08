<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'
import { Button, Card, Flex, Grid, Sheet } from '@dolanske/vui'
import SteamLink from '@/components/Shared/SteamLink.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import UserLink from '~/components/Shared/UserLink.vue'

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
const emit = defineEmits(['edit'])

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// Handle closing the sheet
function handleClose() {
  isOpen.value = false
}

// Handle edit button click
function handleEdit() {
  emit('edit', props.game)
  isOpen.value = false
}

// Gameservers data fetching
const supabase = useSupabaseClient()
const gameserversLoading = ref(false)
const gameserversError = ref('')
const gameservers = ref<QueryData<typeof gameserversQuery>>([])

const gameserversQuery = supabase.from('gameservers').select(`
  id,
  name,
  description,
  region,
  addresses,
  port,
  created_at,
  container (
    name,
    running,
    healthy
  )
`)

// Fetch gameservers when game changes
watchEffect(async () => {
  if (!props.game?.id) {
    gameservers.value = []
    return
  }

  gameserversLoading.value = true
  gameserversError.value = ''

  try {
    const { data, error } = await gameserversQuery.eq('game', props.game.id)

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
        <h4>Game Details</h4>
        <Flex y-center gap="s">
          <Button
            v-if="props.game"
            @click="handleEdit"
          >
            <template #start>
              <Icon name="ph:pencil" />
            </template>
            Edit
          </Button>
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

        <!-- Metadata -->
        <Card separators>
          <template #header>
            <h6>Metadata</h6>
          </template>

          <Flex column gap="l" expand>
            <Grid class="game-details__item" expand :columns="2">
              <span class="game-details__label">Created:</span>
              <Flex column>
                <TimestampDate :date="props.game.created_at" />
                <Flex v-if="props.game.created_by" gap="xs" y-center class="game-details__metadata-by">
                  <span>by</span>
                  <UserLink :user-id="props.game.created_by" />
                </Flex>
              </Flex>
            </Grid>

            <Grid v-if="props.game.modified_at" class="game-details__item" expand :columns="2">
              <span class="game-details__label">Modified:</span>
              <Flex column>
                <TimestampDate :date="props.game.modified_at" />
                <Flex v-if="props.game.modified_by" gap="xs" y-center class="game-details__metadata-by">
                  <span>by</span>
                  <UserLink :user-id="props.game.modified_by" />
                </Flex>
              </Flex>
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
    font-size: 1.3rem;
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

h4 {
  margin-top: 0;
  margin-bottom: var(--space-xs);
}
</style>
