<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Flex, Tooltip } from '@dolanske/vui'
import GameIcon from '@/components/GameServers/GameIcon.vue'
import GameDetailsModalTrigger from '@/components/Shared/GameDetailsModalTrigger.vue'

interface Props {
  games: Tables<'games'>[]
  size?: 's' | 'm' | 'l'
  maxVisible?: number
  showLabel?: boolean
}

withDefaults(defineProps<Props>(), {
  size: 's',
  maxVisible: 5,
  showLabel: true,
})
</script>

<template>
  <div v-if="games.length > 0" class="event-games">
    <div v-if="showLabel" class="event-games__label">
      Featured Games
    </div>
    <Flex gap="xs" wrap class="event-games__list">
      <!-- Game icons -->
      <GameDetailsModalTrigger
        v-for="game in games"
        :key="game.id"
        v-slot="{ open }"
        :game-id="game.id"
      >
        <Tooltip placement="top">
          <template #tooltip>
            {{ game.name }}
          </template>
          <button
            type="button"
            class="event-games__icon"
            :aria-label="`Open details for ${game.name ?? 'game'}`"
            @click.stop="open"
          >
            <GameIcon :game="game" :size="size" />
          </button>
        </Tooltip>
      </GameDetailsModalTrigger>
    </Flex>
  </div>
</template>

<style lang="scss" scoped>
.event-games {
  &__label {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-secondary);
    margin-bottom: var(--space-s);
  }

  &__list {
    align-items: center;
  }

  &__icon {
    transition: transform 0.2s ease;
    cursor: pointer;
    background: transparent;
    border: none;
    padding: 0;
    display: flex;

    &:hover {
      transform: scale(1.1);
    }
  }
}
</style>
