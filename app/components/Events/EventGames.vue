<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Flex, Tooltip } from '@dolanske/vui'
import GameIcon from '@/components/GameServers/GameIcon.vue'

interface Props {
  games: Tables<'games'>[]
  size?: 'small' | 'medium' | 'large'
  maxVisible?: number
  showLabel?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 'small',
  maxVisible: 5,
  showLabel: true,
})

// Show only the first N games and indicate if there are more
const visibleGames = computed(() => {
  return props.games.slice(0, props.maxVisible)
})

const hiddenCount = computed(() => {
  return Math.max(0, props.games.length - props.maxVisible)
})
</script>

<template>
  <div v-if="games.length > 0" class="event-games">
    <div v-if="showLabel" class="event-games__label">
      Featured Games
    </div>
    <Flex gap="xs" wrap class="event-games__list">
      <!-- Visible game icons -->
      <Tooltip
        v-for="game in visibleGames"
        :key="game.id"
        placement="top"
      >
        <template #tooltip>
          {{ game.name }}
        </template>
        <div class="event-games__icon">
          <GameIcon :game="game" :size="size" />
        </div>
      </Tooltip>

      <!-- "and X more" indicator -->
      <Tooltip
        v-if="hiddenCount > 0"
        placement="top"
      >
        <template #tooltip>
          {{ hiddenCount }} more game{{ hiddenCount === 1 ? '' : 's' }}
        </template>
        <div class="event-games__more" :class="`event-games__more--${size}`">
          +{{ hiddenCount }}
        </div>
      </Tooltip>
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

    &:hover {
      transform: scale(1.1);
    }
  }

  &__more {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-background-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-m);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: var(--color-background-tertiary);
      transform: scale(1.05);
    }

    &--small {
      width: 24px;
      height: 24px;
      font-size: 10px;
    }

    &--medium {
      width: 32px;
      height: 32px;
      font-size: var(--font-size-xs);
    }

    &--large {
      width: 48px;
      height: 48px;
      font-size: var(--font-size-s);
    }
  }
}
</style>
