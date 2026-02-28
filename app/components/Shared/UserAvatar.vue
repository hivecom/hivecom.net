<script setup lang="ts">
import { Avatar, Skeleton } from '@dolanske/vui'
import { computed } from 'vue'
import UserPreviewHover from '@/components/Shared/UserPreviewHover.vue'
import { useCacheUserData } from '@/composables/useCacheUserData'

interface UserData {
  avatarUrl?: string | null
  username?: string | null
}

interface Props {
  userId?: string | null
  /**
   * Pre-fetched user data. When provided, the component skips internal
   * fetching and renders the supplied values directly (controlled mode).
   */
  userData?: UserData | null
  size?: 's' | 'm' | 'l' | number
  /** Wrap the avatar in a NuxtLink to the user's profile. */
  linked?: boolean
  /** Wrap the avatar in a UserPreviewHover popout. */
  showPreview?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 'm',
  linked: false,
  showPreview: false,
})

// Controlled mode: userData prop was explicitly passed (even if null)
const isControlled = computed(() => props.userData !== undefined)

// Only fetch when in standalone mode with a valid userId
const { user, loading } = useCacheUserData(
  computed(() => (!isControlled.value && props.userId) ? props.userId : null),
  {
    includeAvatar: true,
    includeRole: false,
    userTtl: 10 * 60 * 1000,
    avatarTtl: 30 * 60 * 1000,
  },
)

const resolvedAvatarUrl = computed(() => {
  if (isControlled.value) {
    return props.userData?.avatarUrl ?? null
  }
  return user.value?.avatarUrl ?? null
})

const initials = computed(() => {
  const name = isControlled.value
    ? props.userData?.username
    : user.value?.username

  if (!name)
    return ''

  return name
    .split(' ')
    .map((w: string) => w.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2)
})

const showSkeleton = computed(() => !isControlled.value && loading.value)

const profileLink = computed(() => {
  if (!props.userId)
    return null
  return `/profile/${props.userId}`
})

const ariaLabel = computed(() => {
  const name = isControlled.value
    ? props.userData?.username
    : user.value?.username
  return name ? `View profile of ${name}` : 'View profile'
})

function getSizePixels(size: 's' | 'm' | 'l' | number): string {
  if (typeof size === 'number')
    return `${size}px`
  switch (size) {
    case 's': return '28px'
    case 'm': return '40px'
    case 'l': return '48px'
  }
}
</script>

<template>
  <!-- Loading skeleton (standalone mode only) -->
  <Skeleton
    v-if="showSkeleton"
    :width="getSizePixels(size)"
    :height="getSizePixels(size)"
    style="border-radius: 50%;"
  />

  <!-- With preview hover + link -->
  <UserPreviewHover
    v-else-if="showPreview && linked && userId"
    :user-id="userId"
    class="user-avatar__wrapper"
  >
    <NuxtLink
      :to="profileLink!"
      class="user-avatar__link"
      :aria-label="ariaLabel"
    >
      <Avatar :size="size" :url="resolvedAvatarUrl || undefined">
        <template v-if="!resolvedAvatarUrl && initials" #default>
          {{ initials }}
        </template>
      </Avatar>
    </NuxtLink>
  </UserPreviewHover>

  <!-- With preview hover, no link -->
  <UserPreviewHover
    v-else-if="showPreview && userId"
    :user-id="userId"
    class="user-avatar__wrapper"
  >
    <Avatar :size="size" :url="resolvedAvatarUrl || undefined">
      <template v-if="!resolvedAvatarUrl && initials" #default>
        {{ initials }}
      </template>
    </Avatar>
  </UserPreviewHover>

  <!-- Link only, no preview -->
  <NuxtLink
    v-else-if="linked && profileLink"
    :to="profileLink"
    class="user-avatar__link"
    :aria-label="ariaLabel"
  >
    <Avatar :size="size" :url="resolvedAvatarUrl || undefined">
      <template v-if="!resolvedAvatarUrl && initials" #default>
        {{ initials }}
      </template>
    </Avatar>
  </NuxtLink>

  <!-- Plain avatar -->
  <Avatar v-else :size="size" :url="resolvedAvatarUrl || undefined">
    <template v-if="!resolvedAvatarUrl && initials" #default>
      {{ initials }}
    </template>
  </Avatar>
</template>

<style lang="scss" scoped>
.user-avatar {
  &__wrapper {
    display: inline-flex;
  }

  &__link {
    display: inline-flex;
    text-decoration: none;
    color: inherit;
    transition: opacity var(--transition);

    &:hover {
      opacity: 0.8;
    }
  }
}
</style>
