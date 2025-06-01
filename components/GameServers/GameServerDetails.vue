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
  <Card class="server-details">
    <Flex column gap="l">
      <h3 class="section-title">
        <Icon name="ph:hard-drives" />
        Server Information
      </h3>

      <Grid :columns="2" gap="l" class="details-grid">
        <div class="detail-item">
          <span class="detail-label">Server ID</span>
          <span class="detail-value">{{ gameserver.id }}</span>
        </div>

        <div v-if="game" class="detail-item">
          <span class="detail-label">Game</span>
          <span class="detail-value">{{ game.name }}</span>
        </div>

        <div v-if="gameserver.region" class="detail-item">
          <span class="detail-label">Region</span>
          <div class="detail-value">
            <RegionIndicator :region="gameserver.region" show-label />
          </div>
        </div>

        <div v-if="gameserver.administrator" class="detail-item">
          <span class="detail-label">Administrator</span>
          <div class="detail-value">
            <UserLink :user-id="gameserver.administrator" />
          </div>
        </div>

        <div v-if="gameserver.container" class="detail-item">
          <span class="detail-label">Container</span>
          <span class="detail-value">{{ gameserver.container }}</span>
        </div>

        <div v-if="gameserver.port" class="detail-item">
          <span class="detail-label">Port</span>
          <span class="detail-value">{{ gameserver.port }}</span>
        </div>
      </Grid>
    </Flex>
  </Card>
</template>

<style lang="scss" scoped>
.section-title {
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

.details-grid {
  .detail-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);

    .detail-label {
      font-size: var(--font-size-s);
      font-weight: 600;
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .detail-value {
      font-size: var(--font-size-m);
      color: var(--color-text);
      font-weight: 500;
    }
  }
}

@media (max-width: 992px) {
  .details-grid {
    grid-template-columns: 1fr !important;
  }
}
</style>
