<script setup lang="ts">
import { Avatar, Flex, Skeleton } from '@dolanske/vui'
import RoleIndicator from '@/components/Shared/RoleIndicator.vue'
import UserPreviewHover from '@/components/Shared/UserPreviewHover.vue'
import { useCacheUserData } from '@/composables/useCacheUserData'

interface Props {
  userId?: string | null
  userProfile?: {
    id: string
    username: string
    avatar_url?: string | null
    role?: string | null
  } | null
  showRole?: boolean
  size?: 's' | 'm' | 'l'
  showProfilePreview?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showRole: false,
  size: 'm',
  showProfilePreview: true,
})

// Determine what data we need to fetch
const shouldFetchUser = computed(() => !props.userProfile && props.userId)
const shouldFetchAvatar = computed(() => props.userProfile && props.userId)

const {
  user: fetchedUser,
  loading: userLoading,
  userInitials: fetchedUserInitials,
} = useCacheUserData(
  computed(() => shouldFetchUser.value ? props.userId : null),
  {
    includeRole: props.showRole,
    includeAvatar: true,
    userTtl: 10 * 60 * 1000, // 10 minutes
    avatarTtl: 30 * 60 * 1000, // 30 minutes
  },
)

// Fetch avatar separately when userProfile is provided
const avatarUrl = ref<string | null>(null)
const avatarLoading = ref(false)

async function fetchAvatar() {
  if (!shouldFetchAvatar.value)
    return

  avatarLoading.value = true
  try {
    const { getUserAvatarUrl } = await import('@/lib/storage')
    const supabase = useSupabaseClient()
    avatarUrl.value = await getUserAvatarUrl(supabase, props.userId!)
  }
  catch (error) {
    console.error('Failed to fetch avatar:', error)
    avatarUrl.value = null
  }
  finally {
    avatarLoading.value = false
  }
}

// Watch for changes to trigger avatar fetch
watch(shouldFetchAvatar, (shouldFetch) => {
  if (shouldFetch) {
    fetchAvatar()
  }
}, { immediate: true })

// Use provided userProfile or fetched user
const user = computed(() => {
  if (props.userProfile) {
    return {
      id: props.userProfile.id,
      username: props.userProfile.username,
      avatarUrl: avatarUrl.value || props.userProfile.avatar_url,
      role: props.userProfile.role,
    }
  }
  return fetchedUser.value
})

const userInitials = computed(() => {
  if (props.userProfile) {
    return props.userProfile.username.charAt(0).toUpperCase()
  }
  return fetchedUserInitials.value
})

const loading = computed(() => userLoading.value || (shouldFetchAvatar.value && avatarLoading.value))

const currentUser = useSupabaseUser()
</script>

<template>
  <div class="user-display">
    <!-- Unauthenticated user state -->
    <Flex v-if="!currentUser" gap="m" y-center class="user-display__header" />

    <!-- Loading state -->
    <Flex v-else-if="loading" gap="m" y-center class="user-display__header">
      <Skeleton
        :width="size === 's' ? '32px' : size === 'm' ? '40px' : '48px'"
        :height="size === 's' ? '32px' : size === 'm' ? '40px' : '48px'"
        style="border-radius: 50%;"
      />
      <div class="user-display__info">
        <Skeleton width="120px" height="20px" />
      </div>
    </Flex>

    <!-- No user state -->
    <Flex v-else-if="!userId" gap="m" y-center class="user-display__header">
      <Avatar :size="size">
        SY
      </Avatar>
      <div class="user-display__info">
        <span class="user-display__username">System</span>
      </div>
    </Flex>

    <!-- User data -->
    <Flex v-else-if="user" gap="m" y-center class="user-display__header">
      <UserPreviewHover
        v-if="showProfilePreview"
        :user-id="user.id"
        class="user-display__avatar-wrapper"
      >
        <NuxtLink
          :to="`/profile/${user.id}`"
          class="user-display__link"
          :aria-label="`View profile of ${user.username}`"
        >
          <Avatar :size="size" :url="user.avatarUrl || undefined">
            <template v-if="!user.avatarUrl" #default>
              {{ userInitials }}
            </template>
          </Avatar>
        </NuxtLink>
      </UserPreviewHover>
      <div v-else class="user-display__avatar-wrapper">
        <NuxtLink
          :to="`/profile/${user.id}`"
          class="user-display__link"
          :aria-label="`View profile of ${user.username}`"
        >
          <Avatar :size="size" :url="user.avatarUrl || undefined">
            <template v-if="!user.avatarUrl" #default>
              {{ userInitials }}
            </template>
          </Avatar>
        </NuxtLink>
      </div>
      <div class="user-display__info">
        <Flex gap="xs" x-start y-center wrap>
          <NuxtLink
            :to="`/profile/${user.id}`"
            class="user-display__link"
            :aria-label="`View profile of ${user.username}`"
          >
            <span class="user-display__username">{{ user.username }}</span>
          </NuxtLink>
          <RoleIndicator
            v-if="showRole"
            :role="user.role"
            size="s"
          />
        </Flex>
      </div>
    </Flex>
  </div>
</template>

<style lang="scss" scoped>
.user-display {
  &__username {
    font-weight: var(--font-weight-medium);
    color: var(--color-text);

    &--error {
      color: var(--color-text-red);
    }
  }

  &__link {
    text-decoration: none;
    color: inherit;
    transition: opacity 0.2s ease;

    &:hover {
      opacity: 0.8;
    }

    .user-display__username {
      &:hover {
        text-decoration: underline;
      }
    }
  }

  &__avatar-wrapper {
    display: inline-flex;
  }
}
</style>
