<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Card, Flex, Grid } from '@dolanske/vui'
import RegionIndicator from '~/components/Shared/RegionIndicator.vue'
import UserLink from '~/components/Shared/UserLink.vue'

interface Props {
  gameserver: Tables<'gameservers'>
  game?: Tables<'games'> | null
}

defineProps<Props>()
</script>

<template>
  <Card class="gameserver-details">
    <Flex column gap="l">
      <h3 class="gameserver-details__title">
        <Icon name="ph:hard-drives" />
        Server Information
      </h3>

      <Grid :columns="2" gap="l" class="gameserver-details__grid">
        <div class="gameserver-details__item">
          <span class="gameserver-details__label">Server ID</span>
          <span class="gameserver-details__value">{{ gameserver.id }}</span>
        </div>

        <div v-if="game" class="gameserver-details__item">
          <span class="gameserver-details__label">Game</span>
          <span class="gameserver-details__value">{{ game.name }}</span>
        </div>

        <div v-if="gameserver.region" class="gameserver-details__item">
          <span class="gameserver-details__label">Region</span>
          <div class="gameserver-details__value">
            <RegionIndicator :region="gameserver.region" show-label />
          </div>
        </div>

        <div v-if="gameserver.administrator" class="gameserver-details__item">
          <span class="gameserver-details__label">Administrator</span>
          <div class="gameserver-details__value">
            <UserLink :user-id="gameserver.administrator" />
          </div>
        </div>

        <div v-if="gameserver.container" class="gameserver-details__item">
          <span class="gameserver-details__label">Container</span>
          <span class="gameserver-details__value">{{ gameserver.container }}</span>
        </div>

        <div v-if="gameserver.port" class="gameserver-details__item">
          <span class="gameserver-details__label">Port</span>
          <span class="gameserver-details__value">{{ gameserver.port }}</span>
        </div>
      </Grid>
    </Flex>
  </Card>
</template>

<style lang="scss" scoped>
.gameserver-details {
  &__title {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    font-size: var(--font-size-xl);
    font-weight: 600;
    margin: 0;
    color: var(--color-text);

    svg {
      color: var(--color-accent);
    }
  }

  &__item {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  &__label {
    font-size: var(--font-size-s);
    font-weight: 600;
    color: var(--color-text-lightest);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  &__value {
    font-size: var(--font-size-m);
    color: var(--color-text);
    font-weight: 500;
  }

  @media (max-width: 992px) {
    &__grid {
      grid-template-columns: 1fr !important;
    }
  }
}
</style>
