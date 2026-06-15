<script setup lang="ts">
import { Indicator, Skeleton, Tooltip } from '@dolanske/vui'
import { computed } from 'vue'
import { useSupabaseUser } from '#imports'
import AvatarMedia from '@/components/Shared/AvatarMedia.vue'
import UserPreviewHover from '@/components/Shared/UserPreviewHover.vue'
import { useDataUser } from '@/composables/useDataUser'
import { useUserActivityStatus } from '@/composables/useUserActivityStatus'
import { useUserId } from '@/composables/useUserId'

interface Props {
  userId?: string | null
  size?: 's' | 'm' | 'l' | number
  /** Wrap the avatar in a NuxtLink to the user's profile. */
  linked?: boolean
  /** Wrap the avatar in a UserPreviewHover popout. */
  showPreview?: boolean
  /** Show an online/away indicator dot based on last_seen. */
  showOnlineIndicator?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 'm',
  linked: false,
  showPreview: false,
  showOnlineIndicator: false,
})

const currentUser = useSupabaseUser()
const currentUserId = useUserId()

const { user: userData, loading } = useDataUser(
  computed(() => props.userId ?? null),
  {
    includeAvatar: true,
    includeRole: false,
    userTtl: 10 * 60 * 1000,
    avatarTtl: 30 * 60 * 1000,
  },
)

const avatarUrl = computed(() => userData.value?.avatarUrl ?? null)

const initials = computed(() => {
  const name = userData.value?.username
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

  const isOwner = !!currentUserId.value && currentUserId.value === props.userId
  const isSignedIn = !!currentUser.value
  if (!isOwner && !isSignedIn && !userData.value?.isPublic)
    return null

  if (userData.value?.username_set && userData.value?.username)
    return `/profile/${userData.value.username}`
  return `/profile/${props.userId}`
})

const ariaLabel = computed(() => {
  const name = userData.value?.username
  return name ? `View profile of ${name}` : 'View profile'
})

const showSkeleton = computed(() =>
  loading.value && !!props.userId,
)

const resolvedActivityStatus = useUserActivityStatus(
  () => props.userId ?? null,
  () => userData.value?.last_seen ?? null,
)

const activityStatus = computed(() =>
  props.showOnlineIndicator ? resolvedActivityStatus.value : null,
)

const indicatorSize = computed((): 's' | 'm' | 'l' => {
  if (props.size === 's')
    return 's'
  if (props.size === 'l')
    return 'l'
  return 's'
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

const attrs = useAttrs()
</script>

<template>
  <!-- Loading skeleton -->
  <Skeleton
    v-if="showSkeleton"
    :width="getSizePixels(size)"
    :height="getSizePixels(size)"
    style="border-radius: var(--border-radius-pill);"
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
      <div class="user-avatar__media-wrap">
        <AvatarMedia
          :url="avatarUrl"
          :size="size"
          :initials="initials"
          :alt="ariaLabel"
          v-bind="attrs"
        />
        <Tooltip v-if="activityStatus" placement="top">
          <template #tooltip>
            <p>{{ activityStatus.lastSeenText }}</p>
          </template>
          <Indicator
            :variant="activityStatus.isActive ? 'online' : activityStatus.isAway ? 'away' : 'offline'"
            :size="indicatorSize"
            class="user-avatar__online-indicator"
            outline
          />
        </Tooltip>
      </div>
    </NuxtLink>
  </UserPreviewHover>

  <!-- With preview hover, no link -->
  <UserPreviewHover
    v-else-if="showPreview && userId"
    :user-id="userId"
    class="user-avatar__wrapper"
  >
    <div class="user-avatar__media-wrap">
      <AvatarMedia
        :url="avatarUrl"
        :size="size"
        :initials="initials"
        :alt="ariaLabel"
        v-bind="attrs"
      />
      <Tooltip v-if="activityStatus" placement="top">
        <template #tooltip>
          <p>{{ activityStatus.lastSeenText }}</p>
        </template>
        <Indicator
          :variant="activityStatus.isActive ? 'online' : activityStatus.isAway ? 'away' : 'offline'"
          :size="indicatorSize"
          class="user-avatar__online-indicator"
          outline
        />
      </Tooltip>
    </div>
  </UserPreviewHover>

  <!-- Link only, no preview -->
  <NuxtLink
    v-else-if="linked && profileLink"
    :to="profileLink"
    class="user-avatar__link"
    :aria-label="ariaLabel"
  >
    <div class="user-avatar__media-wrap">
      <AvatarMedia
        :url="avatarUrl"
        :size="size"
        :initials="initials"
        :alt="ariaLabel"
        v-bind="attrs"
      />
      <Tooltip v-if="activityStatus" placement="top">
        <template #tooltip>
          <p>{{ activityStatus.lastSeenText }}</p>
        </template>
        <Indicator
          :variant="activityStatus.isActive ? 'online' : activityStatus.isAway ? 'away' : 'offline'"
          :size="indicatorSize"
          class="user-avatar__online-indicator"
          outline
        />
      </Tooltip>
    </div>
  </NuxtLink>

  <!-- Plain avatar -->
  <div v-else class="user-avatar__media-wrap">
    <AvatarMedia
      :url="avatarUrl"
      :size="size"
      :initials="initials"
      :alt="ariaLabel"
      v-bind="attrs"
    />
    <Tooltip v-if="activityStatus" placement="top">
      <template #tooltip>
        <p>{{ activityStatus.lastSeenText }}</p>
      </template>
      <Indicator
        :variant="activityStatus.isActive ? 'online' : activityStatus.isAway ? 'away' : 'offline'"
        :size="indicatorSize"
        class="user-avatar__online-indicator"
        outline
      />
    </Tooltip>
  </div>
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

  &__media-wrap {
    position: relative;
    display: inline-flex;
  }

  &__online-indicator {
    position: absolute;
    bottom: 1px;
    right: 1px;
  }
}
</style>
