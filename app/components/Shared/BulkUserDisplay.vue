<script setup lang="ts">
import { Card, Grid, Skeleton } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import { useBulkUserData } from '@/composables/useUserData'
import UserDisplay from './UserDisplay.vue'

interface Props {
  userIds: string[]
  columns?: number | string
  gap?: 'xs' | 's' | 'm' | 'l' | 'xl'
  showRole?: boolean
  userSize?: 's' | 'm' | 'l'
  itemClass?: string
  expand?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  columns: 2,
  gap: 's',
  showRole: false,
  userSize: 's',
  expand: false,
})

// Convert userIds array to reactive ref
const userIdsRef = ref(props.userIds)

// Watch for prop changes and update ref
watch(() => props.userIds, (newIds) => {
  userIdsRef.value = newIds
}, { immediate: true })

// Use bulk user data composable
const {
  users,
  loading,
  error,
  refetch,
} = useBulkUserData(userIdsRef, {
  includeRole: props.showRole,
  includeAvatar: true,
  userTtl: 10 * 60 * 1000, // 10 minutes
  avatarTtl: 30 * 60 * 1000, // 30 minutes
})

// Convert users map to array for template iteration
const usersList = computed(() => {
  return props.userIds
    .map(id => ({
      id,
      profile: users.value.get(id) || null,
    }))
    .filter(user => user.profile !== null)
})

// Expose refetch for parent components
defineExpose({
  refetch,
})
</script>

<template>
  <div class="bulk-user-display">
    <!-- Loading State -->
    <Grid
      v-if="loading && userIds.length > 0"
      :columns="columns"
      :gap="gap"
      :expand="expand"
      class="bulk-user-display__loading"
    >
      <div
        v-for="_ in userIds.length"
        :key="`skeleton-${_}`"
        :class="itemClass"
        class="bulk-user-display__skeleton-item"
      >
        <Skeleton height="40px" width="100%" />
      </div>
    </Grid>

    <!-- Error State -->
    <div v-else-if="error" class="bulk-user-display__error">
      <p class="color-text-danger">
        {{ error }}
      </p>
      <button class="bulk-user-display__retry" @click="refetch">
        Retry
      </button>
    </div>

    <!-- Empty State -->
    <div v-else-if="userIds.length === 0" class="bulk-user-display__empty">
      <slot name="empty">
        <p class="color-text-light">
          No users to display
        </p>
      </slot>
    </div>

    <!-- Users Grid -->
    <Grid
      v-else
      :columns="columns"
      :gap="gap"
      :expand="expand"
      class="bulk-user-display__grid"
    >
      <NuxtLink
        v-for="user in usersList"
        :key="user.id"
        :to="`/profile/${user.profile?.username || user.id}`"
        class="bulk-user-display__link"
      >
        <Card
          :class="itemClass"
          class="bulk-user-display__item"
        >
          <UserDisplay
            :user-id="user.id"
            :user-profile="user.profile"
            :show-role="showRole"
            :size="userSize"
          />
        </Card>
      </NuxtLink>
    </Grid>
  </div>
</template>

<style lang="scss" scoped>
.bulk-user-display {
  width: 100%;

  &__error {
    padding: var(--space-m);
    text-align: center;

    p {
      margin: 0 0 var(--space-s) 0;
    }
  }

  &__retry {
    background: var(--color-bg-accent);
    color: var(--color-text-on-accent);
    border: none;
    padding: var(--space-xs) var(--space-s);
    border-radius: var(--border-radius-s);
    cursor: pointer;
    font-size: var(--font-size-s);

    &:hover {
      background: var(--color-bg-accent-hover);
    }
  }

  &__empty {
    padding: var(--space-l);
    text-align: center;

    p {
      margin: 0;
    }
  }

  &__skeleton-item {
    padding: var(--space-s);
  }
}
</style>
