<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Badge, Button, Card, Flex, Skeleton } from '@dolanske/vui'
import BulkAvatarDisplay from '@/components/Shared/BulkAvatarDisplay.vue'

interface Props {
  profile: Tables<'profiles'>
  friends: string[]
  pendingRequests: string[]
  isOwnProfile: boolean
  loading?: boolean
}

const _props = withDefaults(defineProps<Props>(), {
  loading: false,
})

const emit = defineEmits<{
  openFriendsModal: []
}>()
</script>

<template>
  <Card
    separators
    class="friends-section"
    :class="{ 'friends-section--loading': loading }"
  >
    <template #header>
      <Flex x-between y-center>
        <Flex gap="xs" y-center>
          <h3>Friends</h3>
          <Badge v-if="friends.length > 0" variant="info" size="s">
            {{ friends.length }}
          </Badge>
        </Flex>
        <Button variant="gray" size="s" @click="emit('openFriendsModal')">
          <template #start>
            <Icon name="ph:users" />
          </template>
          View All
        </Button>
      </Flex>
    </template>

    <!-- Loading State -->
    <div v-if="loading" class="friends-loading">
      <div class="friends-loading__avatars">
        <div
          v-for="index in 5"
          :key="`friends-loading-avatar-${index}`"
          class="friends-loading__avatar"
        >
          <Skeleton width="100%" height="100%" class="friends-loading__avatar-skeleton" />
        </div>
      </div>
    </div>

    <!-- Friends Avatar Display -->
    <div v-else-if="friends.length > 0" class="friends-content">
      <BulkAvatarDisplay
        :user-ids="friends"
        :max-users="10"
        :avatar-size="40"
        :show-names="true"
      />

      <!-- Pending Invites (only visible to own profile) -->
      <div v-if="isOwnProfile && pendingRequests.length > 0" class="friends-requests">
        <Flex gap="xs" y-center class="friends-requests__header">
          <Icon name="ph:bell" size="16" class="text-color-orange" />
          <span class="text-s text-color-light">Pending friend requests:</span>
          <Badge variant="warning" size="s">
            {{ pendingRequests.length }}
          </Badge>
        </Flex>
        <BulkAvatarDisplay
          :user-ids="pendingRequests"
          :max-users="5"
          :avatar-size="32"
          :show-names="true"
        />
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="friends-empty">
      <Flex column y-center x-center gap="s">
        <Icon name="ph:users" size="32" class="text-color-light" />
        <p class="text-color-light text-s text-center">
          <template v-if="isOwnProfile">
            You haven't made any friends yet. Start connecting with other community members!
          </template>
          <template v-else>
            {{ profile.username }} hasn't made any friends yet. Why not be the first?
          </template>
        </p>

        <!-- Show pending requests even if no friends (only for own profile) -->
        <div v-if="isOwnProfile && pendingRequests.length > 0" class="friends-requests friends-requests--empty-state">
          <Flex gap="xs" y-center class="friends-requests__header">
            <Icon name="ph:bell" size="16" class="text-color-orange" />
            <span class="text-s text-color-light">Pending friend requests:</span>
            <Badge variant="warning" size="s">
              {{ pendingRequests.length }}
            </Badge>
          </Flex>
          <BulkAvatarDisplay
            :user-ids="pendingRequests"
            :max-users="5"
            :avatar-size="32"
            :show-names="true"
          />
        </div>
      </Flex>
    </div>
  </Card>
</template>

<style lang="scss" scoped>
.friends-section {
  transition: min-height 0.25s ease;

  &--loading {
    min-height: 120px;
  }
}

.friends-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
}

.friends-loading {
  display: flex;
  justify-content: center;
}

.friends-loading__avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
}

.friends-loading__avatar-skeleton {
  border-radius: 50%;
}

.friends-loading__avatars {
  display: inline-flex;
  gap: 0;
  min-height: 36px;
  justify-content: center;
  align-items: center;
  width: fit-content;
  margin: 0 auto;
}

.friends-requests {
  &__header {
    margin-bottom: var(--space-s);
  }

  &--empty-state {
    margin-top: var(--space-m);
    padding-top: var(--space-m);
    border-top: 1px solid var(--color-border);
  }
}

.friends-empty {
  padding: var(--space-l);
  text-align: center;

  p {
    margin: 0;
  }
}
</style>
