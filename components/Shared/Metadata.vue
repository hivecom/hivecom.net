<script setup lang="ts">
import { Card, Grid, Skeleton } from '@dolanske/vui'
import TimestampDate from '~/components/Shared/TimestampDate.vue'
import UserDisplay from '~/components/Shared/UserDisplay.vue'

interface Props {
  createdAt: string
  createdBy?: string | null
  modifiedAt?: string | null
  modifiedBy?: string | null
  loading?: boolean
}

const props = defineProps<Props>()

// Check if same user created and modified
const isSameUser = computed(() => {
  return props.modifiedAt && props.createdBy === props.modifiedBy
})
</script>

<template>
  <Card class="metadata">
    <div v-if="loading" class="loading-state">
      <Skeleton class="skeleton-line" />
      <Skeleton class="skeleton-line short" />
    </div>

    <div v-else class="metadata-content">
      <div class="metadata-section">
        <div class="timestamp-grid">
          <div class="timestamp-item">
            <span class="timestamp-label">Created</span>
            <TimestampDate :date="createdAt" format="MMM D, YYYY [at] HH:mm" class="timestamp-date" />
          </div>
          <div v-if="modifiedAt" class="timestamp-item">
            <span class="timestamp-label">Modified</span>
            <TimestampDate :date="modifiedAt" format="MMM D, YYYY [at] HH:mm" class="timestamp-date" />
          </div>
        </div>

        <!-- Show single user if same person created and modified -->
        <template v-if="isSameUser && createdBy">
          <UserDisplay :user-id="createdBy" show-role />
        </template>

        <!-- Show separate users if different or no modification -->
        <template v-else>
          <Grid :columns="2">
            <UserDisplay :user-id="createdBy" show-role />
            <UserDisplay v-if="modifiedAt && modifiedBy" :user-id="modifiedBy" show-role />
          </Grid>
        </template>
      </div>
    </div>
  </Card>
</template>

<style lang="scss">
.metadata-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
}

.metadata-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}

.timestamp-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-m);
  margin-top: var(--space-xs);
}

.timestamp-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-xxs);

  .timestamp-label {
    font-size: var(--font-size-xs);
    font-weight: 500;
    color: var(--color-text-lighter);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .timestamp-date {
    font-size: var(--font-size-xs);
    color: var(--color-text);
  }
}

.loading-state {
  .skeleton-line {
    height: 16px;
    margin-bottom: var(--space-s);

    &.short {
      width: 60%;
    }

    &:last-child {
      margin-bottom: 0;
    }
  }
}
</style>
