<script setup lang="ts">
import { Avatar, Skeleton } from '@dolanske/vui'
import { computed } from 'vue'
import UserPreviewHover from '@/components/Shared/UserPreviewHover.vue'
import { useCacheUserData } from '@/composables/useCacheUserData'

interface Props {
  userId?: string | null
  size?: 's' | 'm' | 'l' | number
  /** Wrap the avatar in a NuxtLink to the user's profile. */
  linked?: boolean
  /** Wrap the avatar in a UserPreviewHover popout. */
  showPreview?: boolean
  /**
   * Pre-resolved avatar URL from a parent that already has the data (e.g.
   * UserDisplay with useBulkUserData). When provided, useCacheUserData is
   * skipped entirely - no extra profiles or storage query fires.
   */
  resolvedAvatarUrl?: string | null
  /**
   * Pre-resolved username. Used to build the profile link without a cache
   * lookup when resolvedAvatarUrl is also provided.
   */
  resolvedUsername?: string | null
  /**
   * Pre-resolved username_set flag. Used alongside resolvedUsername to build
   * the correct profile link.
   */
  resolvedUsernameSet?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 'm',
  linked: false,
  showPreview: false,
  resolvedAvatarUrl: undefined,
  resolvedUsername: undefined,
  resolvedUsernameSet: undefined,
})

const hasResolvedData = computed(() => props.resolvedAvatarUrl !== undefined)

const { user, loading } = useCacheUserData(
  computed(() => hasResolvedData.value ? null : (props.userId ?? null)),
  {
    includeAvatar: true,
    includeRole: false,
    userTtl: 10 * 60 * 1000,
    avatarTtl: 30 * 60 * 1000,
  },
)

const avatarUrl = computed(() =>
  hasResolvedData.value ? (props.resolvedAvatarUrl ?? null) : (user.value?.avatarUrl ?? null),
)

const initials = computed(() => {
  const name = hasResolvedData.value ? props.resolvedUsername : user.value?.username
  if (!name)
    return ''

  return name
    .split(' ')
    .map((w: string) => w.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2)
})

const profileLink = computed(() => {
  if (!props.userId)
    return null

  if (hasResolvedData.value) {
    if (props.resolvedUsernameSet && props.resolvedUsername)
      return `/profile/${props.resolvedUsername}`
    return `/profile/${props.userId}`
  }

  if (user.value?.username_set && user.value?.username)
    return `/profile/${user.value.username}`
  return `/profile/${props.userId}`
})

const ariaLabel = computed(() => {
  const name = hasResolvedData.value ? props.resolvedUsername : user.value?.username
  return name ? `View profile of ${name}` : 'View profile'
})

const showSkeleton = computed(() =>
  !hasResolvedData.value && loading.value && !!props.userId,
)

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
  <!-- Loading skeleton -->
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
      <Avatar :size="size" :url="avatarUrl || undefined">
        <template v-if="!avatarUrl && initials" #default>
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
    <Avatar :size="size" :url="avatarUrl || undefined">
      <template v-if="!avatarUrl && initials" #default>
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
    <Avatar :size="size" :url="avatarUrl || undefined">
      <template v-if="!avatarUrl && initials" #default>
        {{ initials }}
      </template>
    </Avatar>
  </NuxtLink>

  <!-- Plain avatar -->
  <Avatar v-else :size="size" :url="avatarUrl || undefined">
    <template v-if="!avatarUrl && initials" #default>
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
