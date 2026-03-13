<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import type { ProfileFriendshipStatus } from '@/types/profile'
import { Alert, Button, Card, Flex, Skeleton } from '@dolanske/vui'
import BulkAvatarDisplay from '@/components/Shared/BulkAvatarDisplay.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'

interface Props {
  profile: Tables<'profiles'>
  friends: string[]
  pendingRequests: string[]
  isOwnProfile: boolean
  loading?: boolean
  friendshipStatus: ProfileFriendshipStatus
  isLoggedIn?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  isLoggedIn: false,
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
  return props.isLoggedIn && !props.isOwnProfile && props.friendshipStatus === 'none'
})

const areMutualFriends = computed(() => {
  return props.isLoggedIn && props.friendshipStatus === 'mutual'
})

const hasSentRequest = computed(() => {
  return props.isLoggedIn && props.friendshipStatus === 'sent_request'
})

const hasReceivedRequest = computed(() => {
  return props.isLoggedIn && props.friendshipStatus === 'received_request'
})

// Handle remove friend confirmation
function handleRemoveFriend() {
  emit('removeFriend')
  showRemoveFriendConfirm.value = false
}

const pendingRequests = computed(() => props.pendingRequests)

const { users: pendingUsers } = useBulkUserData(pendingRequests)
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
          <span v-if="isLoggedIn" class="counter">
            {{ friends.length }}
          </span>
        </Flex>
        <Button v-if="isLoggedIn" variant="gray" size="s" plain @click="emit('openFriendsModal')">
          <template #start>
            <Icon name="ph:users" />
          </template>
          View All
        </Button>
      </Flex>
    </template>

    <!-- Unauthenticated State -->
    <div v-if="!isLoggedIn" class="friends-empty">
      <Flex column y-center x-center gap="s">
        <Icon name="ph:lock" size="32" class="text-color-light" />
        <p class="text-color-light text-s text-center">
          Sign in to see {{ profile.username }}'s friends.
        </p>
      </Flex>
    </div>

    <!-- Loading State -->
    <Flex v-else-if="loading" x-center>
      <Flex :gap="8">
        <div
          v-for="index in 6"
          :key="`friends-loading-avatar-${index}`"
          class="friends-loading__avatar"
        >
          <Skeleton width="100%" height="100%" class="friends-loading__avatar-skeleton" />
        </div>
      </Flex>
    </Flex>

    <!-- Friends Avatar Display -->
    <Flex v-else-if="friends.length > 0 && isLoggedIn" column gap="m">
      <Alert v-if="pendingUsers.size > 0 && props.isOwnProfile" icon-align="start">
        <p>
          You have {{ pendingUsers.size }} pending friend request{{ pendingUsers.size > 1 ? 's' : '' }} from
          <NuxtLink v-for="(request, index) in pendingUsers.values()" :key="request.id" :to="`/profile/${request.id}`">
            {{ request.username }}{{ index < pendingUsers.size - 1 ? ', ' : '' }}.
          </NuxtLink>
        </p>
      </Alert>

      <BulkAvatarDisplay
        :user-ids="friends"
        :max-users="12"
        :avatar-size="40"
        :show-names="true"
        :gap="8"
      />
    </Flex>

    <!-- Empty State -->
    <div v-else-if="isLoggedIn" class="friends-empty">
      <Flex column y-center x-center gap="s">
        <Icon name="ph:users" size="32" class="text-color-light" />
        <p class="text-color-light text-s text-center mb-m">
          <template v-if="isOwnProfile">
            You haven't made any friends yet. Start connecting with other community members!
          </template>
          <template v-else>
            {{ profile.username }} hasn't made any friends yet. Why not be the first?
          </template>
        </p>

        <!-- Show pending requests even if no friends (only for own profile) -->
        <Alert v-if="isOwnProfile && pendingUsers.size > 0">
          <p>
            You have {{ pendingUsers.size }} pending friend request{{ pendingUsers.size > 1 ? 's' : '' }} from
            <NuxtLink v-for="(request, index) in pendingUsers.values()" :key="request.id" :to="`/profile/${request.id}`">
              {{ request.username }}{{ index < pendingUsers.size - 1 ? ', ' : '' }}
            </NuxtLink>.
          </p>
        </Alert>
      </Flex>
    </div>

    <!-- Action Buttons for friend-ship management (only for logged-in users viewing others' profiles) -->
    <template v-if="!props.isOwnProfile && props.isLoggedIn" #footer>
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
    :confirm="handleRemoveFriend"
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

.friends-loading__avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
}

.friends-loading__avatar-skeleton {
  border-radius: 50%;
}
</style>
