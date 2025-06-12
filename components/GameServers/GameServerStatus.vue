<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Badge, Card, Flex, Grid } from '@dolanske/vui'
import TimestampDate from '~/components/Shared/TimestampDate.vue'

interface Props {
  container: Tables<'containers'>
  stateConfig: {
    color: 'success' | 'warning' | 'danger' | 'neutral' | 'accent' | 'info'
    icon: string
    label: string
    description: string
  }
}

defineProps<Props>()
</script>

<template>
  <Card class="gameserver-status">
    <Flex column gap="l">
      <h3 class="gameserver-status__title">
        <Icon name="ph:activity" />
        Server Status
      </h3>

      <Grid :columns="2" gap="l" class="gameserver-status__grid">
        <div class="gameserver-status__item">
          <span class="gameserver-status__label">Status</span>
          <Badge :variant="stateConfig.color" size="l">
            <Icon :name="stateConfig.icon" />
            {{ stateConfig.label }}
          </Badge>
        </div>

        <div class="gameserver-status__item">
          <span class="gameserver-status__label">Running</span>
          <Badge :variant="container.running ? 'success' : 'danger'">
            <Icon :name="container.running ? 'ph:check' : 'ph:x'" />
            {{ container.running ? 'Yes' : 'No' }}
          </Badge>
        </div>

        <div class="gameserver-status__item">
          <span class="gameserver-status__label">Healthy</span>
          <Badge :variant="container.healthy ? 'success' : 'warning'">
            <Icon :name="container.healthy ? 'ph:check' : 'ph:warning'" />
            {{ container.healthy ? 'Yes' : 'No' }}
          </Badge>
        </div>

        <div class="gameserver-status__item">
          <span class="gameserver-status__label">Last Reported</span>
          <span class="gameserver-status__value">
            <TimestampDate size="xs" :date="container.reported_at" />
          </span>
        </div>
      </Grid>
    </Flex>
  </Card>
</template>

<style lang="scss" scoped>
.gameserver-status {
  &__title {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
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
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  &__value {
    font-size: var(--font-size-m);
    color: var(--color-text);
    font-weight: var(--font-weight-medium);
  }

  @media (max-width: 992px) {
    &__grid {
      grid-template-columns: 1fr !important;
    }
  }
}
</style>
