<script setup lang="ts">
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { Card, Divider, Flex, Grid, Sheet } from '@dolanske/vui'

const props = defineProps<{
  game: {
    id: number
    name: string
    shorthand: string | null
    steam_id: number | null
    created_at: string
    created_by: string | null
  } | null
}>()

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// Handle closing the sheet
function handleClose() {
  isOpen.value = false
}

// Format the Steam store URL if a steam_id exists
const steamStoreUrl = computed(() => {
  if (!props.game?.steam_id)
    return null
  return `https://store.steampowered.com/app/${props.game.steam_id}`
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
      <h3>{{ props.game ? props.game.name : 'Game Details' }}</h3>
    </template>

    <Flex v-if="props.game" column gap="m" class="game-detail">
      <Flex column gap="m" expand>
        <!-- Basic info -->
        <Card class="game-info">
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

            <Grid v-if="props.game.steam_id" class="detail-item" expand :columns="2">
              <span class="detail-label">Steam ID:</span>
              <Flex gap="xs">
                <span>{{ props.game.steam_id }}</span>
                <a v-if="steamStoreUrl" :href="steamStoreUrl" target="_blank" rel="noopener noreferrer">
                  <Icon name="ph:steam-logo" />
                  View on Steam
                </a>
              </Flex>
            </Grid>
          </Flex>
        </Card>

        <!-- Metadata -->
        <Card class="game-info">
          <h4>Metadata</h4>
          <Divider size="40" />

          <Flex column gap="l" expand>
            <Grid class="detail-item" expand :columns="2">
              <span class="detail-label">Created:</span>
              <Flex column>
                <TimestampDate :date="props.game.created_at" />
                <span v-if="props.game.created_by" class="metadata-by">by {{ props.game.created_by }}</span>
              </Flex>
            </Grid>
          </Flex>
        </Card>

        <!-- Related Gameservers (placeholder for future implementation) -->
        <Card class="game-info">
          <h4>Related Gameservers</h4>
          <Divider size="40" />

          <p class="placeholder-text">
            Gameservers using this game will be displayed here in a future update.
          </p>
        </Card>
      </Flex>
    </Flex>
  </Sheet>
</template>

<style scoped>
.game-detail {
  padding-bottom: var(--space);
}
.game-info {
  padding: var(--space-s);
  background-color: var(--color-bg);
  margin-bottom: var(--space-l);
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
</style>
