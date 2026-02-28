<script setup lang="ts">
import { Badge, Flex, Skeleton } from '@dolanske/vui'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import UserName from '@/components/Shared/UserName.vue'
import UserRole from '@/components/Shared/UserRole.vue'
import { useCacheUserData } from '@/composables/useCacheUserData'
import { getAnonymousUsername } from '@/lib/anonymous-usernames'

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
  /**
   * Hide avatar, but this option is only respected if
   */
  hideAvatar?: boolean
  centered?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showRole: false,
  size: 'm',
  showProfilePreview: true,
  hideAvatar: false,
})

// Determine what data we need to fetch
const shouldFetchUser = computed(() => !props.userProfile && props.userId)
const shouldFetchAvatar = computed(() => props.userProfile && props.userId)

const {
  user: fetchedUser,
  loading: userLoading,
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

const loading = computed(() => userLoading.value || (shouldFetchAvatar.value && avatarLoading.value))

const anonymousUsername = computed(() => props.userId ? getAnonymousUsername(props.userId) : 'AnonymousUser')

const currentUser = useSupabaseUser()

// Pre-built controlled-mode payloads for sub-components
const avatarUserData = computed(() => {
  if (!user.value)
    return null
  return {
    avatarUrl: user.value.avatarUrl ?? null,
    username: user.value.username,
  }
})

const nameUserData = computed(() => {
  if (!user.value)
    return null
  return {
    id: user.value.id,
    username: user.value.username,
  }
})

function getSkeletonSize(size: 's' | 'm' | 'l'): string {
  switch (size) {
    case 's': return '28px'
    case 'm': return '40px'
    case 'l': return '48px'
  }
}
</script>

<template>
  <div class="user-display">
    <!-- Unauthenticated user state -->
    <Flex v-if="!currentUser" gap="s" y-center class="user-display__header">
      <template v-if="!props.hideAvatar">
        <UserAvatar
          v-if="props.userId"
          :size="size"
          :user-data="{ avatarUrl: null,
                        username: null }"
        />
        <UserAvatar
          v-else
          :size="size"
          :user-data="{ avatarUrl: '/icon.svg',
                        username: null }"
        />
      </template>
      <div class="user-display__info">
        <Flex gap="xs" y-center>
          <template v-if="props.userId">
            <UserName
              no-link
              :user-data="{ id: props.userId,
                            username: anonymousUsername }"
            />
          </template>
          <template v-else>
            <UserName
              no-link
              :user-data="{ id: '',
                            username: 'Hivecom' }"
            >
              <Badge size="xs" variant="accent">
                System
              </Badge>
            </UserName>
          </template>
        </Flex>
      </div>
    </Flex>

    <!-- Loading state -->
    <Flex v-else-if="loading" gap="s" y-center class="user-display__header">
      <Skeleton
        v-if="!hideAvatar"
        :width="getSkeletonSize(size)"
        :height="getSkeletonSize(size)"
        style="border-radius: 50%;"
      />
      <div class="user-display__info">
        <Skeleton width="108px" height="20px" />
      </div>
    </Flex>

    <!-- No user state (system) -->
    <Flex v-else-if="!userId" gap="s" y-center class="user-display__header">
      <UserAvatar
        :size="size"
        :user-data="{ avatarUrl: '/icon.svg',
                      username: null }"
      />
      <div class="user-display__info">
        <UserName
          no-link
          :user-data="{ id: '',
                        username: 'Hivecom' }"
        >
          <Badge size="xs" variant="accent">
            System
          </Badge>
        </UserName>
      </div>
    </Flex>

    <!-- User data -->
    <Flex v-else-if="user" gap="s" y-center class="user-display__header">
      <UserAvatar
        v-if="!props.hideAvatar"
        :user-id="user.id"
        :user-data="avatarUserData"
        :size="size"
        linked
        :show-preview="showProfilePreview && !!currentUser"
      />
      <div class="user-display__info">
        <Flex gap="xs" :x-start="!centered" :x-center="!!centered" y-center wrap class="user-display__name-row">
          <UserName
            :user-id="user.id"
            :user-data="nameUserData"
          >
            <UserRole
              v-if="showRole"
              :role="user.role ?? null"
              size="s"
            />
          </UserName>
        </Flex>
      </div>
    </Flex>
  </div>
</template>

<style lang="scss" scoped>
.user-display {
  &__info {
    display: flex;
    align-items: center;
  }

  &__name-row {
    align-items: center;
  }
}
</style>
