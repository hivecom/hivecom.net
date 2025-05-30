<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'
import { Card, Flex, Grid, Sheet } from '@dolanske/vui'
import SteamLink from '@/components/Shared/SteamLink.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'

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

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// Handle closing the sheet
function handleClose() {
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
      <h4>{{ props.game ? props.game.name : 'Game Details' }}</h4>
    </template>

    <Flex v-if="props.game" column gap="m" class="game-detail">
      <Flex column gap="l" expand>
        <!-- Basic info -->
        <Card>
          <Flex column gap="l" expand>
            <Grid class="detail-item" expand :columns="2">
              <span class="detail-label">ID:</span>
              <span>{{ props.game.id }}</span>
            </Grid>

            <Grid class="detail-item" expand :columns="2">
              <span class="detail-label">Name:</span>
              <span>{{ props.game.name }}</span>
            </Grid>

            <Grid v-if="props.game.shorthand" class="detail-item" expand :columns="2">
              <span class="detail-label">Shorthand:</span>
              <span>{{ props.game.shorthand }}</span>
            </Grid>

            <Grid v-if="props.game.steam_id" class="detail-item" expand :columns="2" y-center>
              <span class="detail-label">Steam ID:</span>
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
            <Grid class="detail-item" expand :columns="2">
              <span class="detail-label">Created:</span>
              <Flex column>
                <TimestampDate :date="props.game.created_at" />
                <Flex v-if="props.game.created_by" gap="xs" y-center class="metadata-by">
                  <span>by</span>
                  <UserDisplay :user-id="props.game.created_by" />
                </Flex>
              </Flex>
            </Grid>

            <Grid v-if="props.game.modified_at" class="detail-item" expand :columns="2">
              <span class="detail-label">Modified:</span>
              <Flex column>
                <TimestampDate :date="props.game.modified_at" />
                <Flex v-if="props.game.modified_by" gap="xs" y-center class="metadata-by">
                  <span>by</span>
                  <UserDisplay :user-id="props.game.modified_by" />
                </Flex>
              </Flex>
            </Grid>
          </Flex>
        </Card>

        <!-- Related Gameservers -->
        <Card separators>
          <template #header>
            <h6>Related Gameservers</h6>
          </template>

          <!-- Loading state -->
          <div v-if="gameserversLoading" class="placeholder-text">
            Loading gameservers...
          </div>

          <!-- Error state -->
          <div v-else-if="gameserversError" class="placeholder-text" style="color: var(--color-text-red);">
            Error: {{ gameserversError }}
          </div>

          <!-- No gameservers -->
          <div v-else-if="gameservers.length === 0" class="placeholder-text">
            No gameservers are currently using this game.
          </div>

          <!-- Gameservers list -->
          <Flex v-else column gap="s">
            <div v-for="gameserver in gameservers" :key="gameserver.id" class="gameserver-item">
              <Flex y-center x-between gap="m">
                <span class="gameserver-name">{{ gameserver.name }}</span>

                <!-- Addresses -->
                <Flex v-if="gameserver.addresses && gameserver.addresses.length > 0" y-center gap="xs">
                  <span v-for="address in gameserver.addresses.slice(0, 1)" :key="address" class="gameserver-address">
                    {{ address }}{{ gameserver.port ? `:${gameserver.port}` : '' }}
                  </span>
                  <span v-if="gameserver.addresses.length > 1" class="address-count">
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

<style scoped>
.game-detail {
  padding-bottom: var(--space);
}

.detail-label {
  font-weight: 500;
  color: var(--color-text-light);
}
h4 {
  margin-top: 0;
  margin-bottom: var(--space-xs);
}
.metadata-by {
  font-size: 1.3rem;
  color: var(--color-text-light);
}
.placeholder-text {
  color: var(--color-text-light);
  font-style: italic;
}

/* Gameserver item styles */
.gameserver-item {
  width: 100%;
  padding: var(--space-s);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-s);
  background-color: var(--color-bg);
}

.gameserver-name {
  font-size: var(--font-size-xs);
  font-weight: 500;
  color: var(--color-text);
}

.gameserver-description {
  font-size: var(--font-size-s);
  color: var(--color-text-light);
  margin: 0;
}

.gameserver-address {
  font-family: var(--font-mono, 'Monaco', 'Menlo', 'Ubuntu Mono', monospace);
  font-size: var(--font-size-xs);
  color: var(--color-text-light);
  background-color: var(--color-bg-raised);
  padding: var(--space-xs) var(--space-s);
  border-radius: var(--border-radius-s);
}

.address-count {
  font-size: var(--font-size-s);
  color: var(--color-text-light);
}

/* Status indicator styles */
.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-indicator.healthy {
  background-color: var(--color-text-green);
}

.status-indicator.unhealthy {
  background-color: var(--color-text-orange);
}

.status-indicator.offline {
  background-color: var(--color-text-red);
}

.status-indicator.unknown {
  background-color: var(--color-text-light);
}
</style>
