<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import type { ProfileFriendshipStatus } from '@/types/profile'
import { Badge, Button, Card, Flex, Skeleton } from '@dolanske/vui'
import BulkAvatarDisplay from '@/components/Shared/BulkAvatarDisplay.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'

interface Props {
  profile: Tables<'profiles'>
  friends: string[]
  pendingRequests: string[]
  isOwnProfile: boolean
  loading?: boolean
  friendshipStatus: ProfileFriendshipStatus
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
})

const emit = defineEmits<{
  openFriendsModal: []
  sendFriendRequest: []
  acceptFriendRequest: []
  ignoreFriendRequest: []
  revokeFriendRequest: []
  removeFriend: []
}>()

const showRemoveFriendConfirm = ref(false)

// Computed properties for friendship status
const canSendFriendRequest = computed(() => {
  return !props.isOwnProfile && props.friendshipStatus === 'none'
})

const areMutualFriends = computed(() => {
  return props.friendshipStatus === 'mutual'
})

const hasSentRequest = computed(() => {
  return props.friendshipStatus === 'sent_request'
})

const hasReceivedRequest = computed(() => {
  return props.friendshipStatus === 'received_request'
})

// Handle remove friend confirmation
function handleRemoveFriend() {
  emit('removeFriend')
  showRemoveFriendConfirm.value = false
}
</script>

<template>
  <Card
    separators
    class="friends-section card-bg"
    :class="{ 'friends-section--loading': loading }"
  >
    <template #header>
      <Flex x-between y-center>
        <Flex gap="xs" y-center>
          <h4>Friends</h4>
          <span class="counter">
            {{ friends.length }}
          </span>
        </Flex>
        <Button variant="gray" size="s" plain @click="emit('openFriendsModal')">
          <template #start>
            <Icon name="ph:users" />
          </template>
          View All
        </Button>
      </Flex>
    </template>

    <!-- Loading State -->
    <div v-if="loading" class="friends-loading">
      <Flex :gap="8" class="friends-loading__avatars">
        <div
          v-for="index in 6"
          :key="`friends-loading-avatar-${index}`"
          class="friends-loading__avatar"
        >
          <Skeleton width="100%" height="100%" class="friends-loading__avatar-skeleton" />
        </div>
      </Flex>
    </div>

    <!-- Friends Avatar Display -->
    <div v-else-if="friends.length > 0" class="friends-content">
      <BulkAvatarDisplay
        :user-ids="friends"
        :max-users="12"
        :avatar-size="40"
        :show-names="true"
        :gap="8"
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

    <!-- Action Buttons for friend-ship management -->
    <template v-if="!props.isOwnProfile" #footer>
      <Flex x-center gap="m">
        <Button
          v-if="canSendFriendRequest"
          size="s"
          variant="accent"
          :disabled="friendshipStatus === 'loading'"
          @click="emit('sendFriendRequest')"
        >
          <template #start>
            <Icon name="ph:user-plus" />
          </template>
          Send Friend Request
        </Button>

        <Button
          v-else-if="hasReceivedRequest"
          size="s"
          variant="accent"
          :disabled="friendshipStatus === 'loading'"
          @click="emit('acceptFriendRequest')"
        >
          <template #start>
            <Icon name="ph:user-check" />
          </template>
          Accept Request
        </Button>

        <Button
          v-if="hasReceivedRequest"
          size="s"
          variant="gray"
          :disabled="friendshipStatus === 'loading'"
          @click="emit('ignoreFriendRequest')"
        >
          <template #start>
            <Icon name="ph:x" />
          </template>
          Ignore Request
        </Button>

        <Button
          v-else-if="hasSentRequest"
          size="s"
          variant="danger"
          :disabled="friendshipStatus === 'loading'"
          @click="emit('revokeFriendRequest')"
        >
          <template #start>
            <Icon name="ph:user-minus" />
          </template>
          Revoke Request
        </Button>

        <Button
          v-else-if="areMutualFriends"
          size="s"
          variant="danger"
          :disabled="friendshipStatus === 'loading'"
          @click="showRemoveFriendConfirm = true"
        >
          <template #start>
            <Icon name="ph:user-minus" />
          </template>
          Remove Friend
        </Button>

        <!-- Show loading button while checking friendship status -->
        <Button
          v-else-if="friendshipStatus === 'loading'"
          size="s"
          :disabled="true"
          variant="gray"
          :loading="true"
        />
      </Flex>
    </template>
  </Card>

  <!-- Remove Friend Confirmation Modal -->
  <ConfirmModal
    v-model:open="showRemoveFriendConfirm"
    v-model:confirm="handleRemoveFriend"
    title="Remove Friend"
    :description="`Are you sure you want to remove ${profile.username} from your friends list? This action cannot be undone.`"
    confirm-text="Remove Friend"
    cancel-text="Cancel"
    :destructive="true"
  />
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
