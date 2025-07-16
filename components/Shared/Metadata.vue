<script setup lang="ts">
import { Card, Grid, Skeleton } from '@dolanske/vui'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'

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
  <div>
    <div v-if="loading" class="metadata__loading">
      <Skeleton class="metadata__skeleton-line" />
      <Skeleton class="metadata__skeleton-line metadata__skeleton-line--short" />
    </div>

    <div v-else class="metadata__content">
      <div class="metadata__section">
        <div class="metadata__timestamp-grid">
          <div class="metadata__timestamp-item">
            <span class="metadata__timestamp-label">Created</span>
            <TimestampDate size="xs" :date="createdAt" format="MMM D, YYYY [at] HH:mm" class="metadata__timestamp-date" />
          </div>
          <div v-if="modifiedAt" class="metadata__timestamp-item">
            <span class="metadata__timestamp-label">Modified</span>
            <TimestampDate size="xs" :date="modifiedAt" format="MMM D, YYYY [at] HH:mm" class="metadata__timestamp-date" />
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
  </div>
</template>

<style lang="scss" scoped>
.metadata {
  &__content {
    display: flex;
    flex-direction: column;
    gap: var(--space-m);
  }

  &__section {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
  }

  &__timestamp-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-m);
    margin-top: var(--space-xs);
  }

  &__timestamp-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-xxs);
  }

  &__timestamp-label {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-lighter);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  &__loading {
    .metadata__skeleton-line {
      height: 16px;
      margin-bottom: var(--space-s);

      &--short {
        width: 60%;
      }

      &:last-child {
        margin-bottom: 0;
      }
    }
  }
}
</style>
