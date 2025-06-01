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
  <Card class="server-status">
    <Flex column gap="l">
      <h3 class="section-title">
        <Icon name="ph:activity" />
        Server Status
      </h3>

      <Grid :columns="2" gap="l" class="status-grid">
        <div class="status-item">
          <span class="status-label">Status</span>
          <Badge :variant="stateConfig.color" size="l">
            <Icon :name="stateConfig.icon" />
            {{ stateConfig.label }}
          </Badge>
        </div>

        <div class="status-item">
          <span class="status-label">Running</span>
          <Badge :variant="container.running ? 'success' : 'danger'">
            <Icon :name="container.running ? 'ph:check' : 'ph:x'" />
            {{ container.running ? 'Yes' : 'No' }}
          </Badge>
        </div>

        <div class="status-item">
          <span class="status-label">Healthy</span>
          <Badge :variant="container.healthy ? 'success' : 'warning'">
            <Icon :name="container.healthy ? 'ph:check' : 'ph:warning'" />
            {{ container.healthy ? 'Yes' : 'No' }}
          </Badge>
        </div>

        <div class="status-item">
          <span class="status-label">Last Reported</span>
          <span class="status-value">
            <TimestampDate :date="container.reported_at" />
          </span>
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

.status-grid {
  .status-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);

    .status-label {
      font-size: var(--font-size-s);
      font-weight: 600;
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .status-value {
      font-size: var(--font-size-m);
      color: var(--color-text);
      font-weight: 500;
    }
  }
}

@media (max-width: 992px) {
  .status-grid {
    grid-template-columns: 1fr !important;
  }
}
</style>
