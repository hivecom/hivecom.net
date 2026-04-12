<script setup lang="ts">
import { useSupabaseUser } from '#imports'
import { Avatar, Skeleton } from '@dolanske/vui'
import { computed } from 'vue'
import UserPreviewHover from '@/components/Shared/UserPreviewHover.vue'
import { useDataUser } from '@/composables/useDataUser'

interface Props {
  userId?: string | null
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

const currentUser = useSupabaseUser()

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

  const isOwner = currentUser.value?.id === props.userId
  if (!isOwner && !userData.value?.isPublic)
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
      <Avatar :size="size" :url="avatarUrl || undefined" v-bind="attrs">
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
    <Avatar :size="size" :url="avatarUrl || undefined" v-bind="attrs">
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
    <Avatar :size="size" :url="avatarUrl || undefined" v-bind="attrs">
      <template v-if="!avatarUrl && initials" #default>
        {{ initials }}
      </template>
    </Avatar>
  </NuxtLink>

  <!-- Plain avatar -->
  <Avatar v-else :size="size" :url="avatarUrl || undefined" v-bind="attrs">
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
