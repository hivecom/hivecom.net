<script setup lang="ts">
import { Flex, Skeleton } from '@dolanske/vui'
import { useCacheUserData } from '@/composables/useCacheUserData'
import { getAnonymousUsername } from '@/lib/anonymous-usernames'

interface Props {
  userId?: string | null
  size?: 's' | 'm' | 'l'
  /**
   * When true the username is rendered as a plain span instead of a
   * NuxtLink to the user's profile.
   */
  noLink?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 'm',
  noLink: false,
})

const {
  user,
  loading,
} = useCacheUserData(
  computed(() => props.userId ?? null),
  {
    includeRole: false,
    includeAvatar: false,
    userTtl: 10 * 60 * 1000,
    avatarTtl: 30 * 60 * 1000,
  },
)

const currentUser = useSupabaseUser()

const anonymousUsername = computed(() =>
  props.userId ? getAnonymousUsername(props.userId) : null,
)

const displayName = computed<string | null>(() => {
  // Unauthenticated users see anonymous names for privacy
  if (!currentUser.value && props.userId) {
    return anonymousUsername.value
  }

  return user.value?.username ?? null
})

const profileLink = computed(() => {
  if (!props.userId)
    return null
  return `/profile/${props.userId}`
})

const canLink = computed(() => {
  return !props.noLink && !!currentUser.value && !!profileLink.value
})

const showSkeleton = computed(() => {
  return !!props.userId && loading.value
})

const ariaLabel = computed(() => {
  return displayName.value
    ? `View profile of ${displayName.value}`
    : undefined
})

const fontClass = computed(() => {
  switch (props.size) {
    case 's': return 'user-name--s'
    case 'l': return 'user-name--l'
    default: return ''
  }
})
</script>

<template>
  <!-- Loading -->
  <Skeleton v-if="showSkeleton" width="108px" height="20px" />

  <!-- Resolved username -->
  <Flex
    v-else-if="displayName"
    gap="xs"
    y-center
    wrap
    class="user-name"
    :class="fontClass"
  >
    <NuxtLink
      v-if="canLink"
      :to="profileLink!"
      class="user-name__link"
      :aria-label="ariaLabel"
    >
      <span class="user-name__text">{{ displayName }}</span>
    </NuxtLink>
    <span v-else class="user-name__text">{{ displayName }}</span>

    <!-- Slot for extra inline content (e.g. System badge, role indicator) -->
    <slot />
  </Flex>

  <!-- System fallback when no userId -->
  <Flex
    v-else-if="!userId"
    gap="xs"
    y-center
    class="user-name"
    :class="fontClass"
  >
    <span class="user-name__text">Hivecom</span>
    <slot />
  </Flex>
</template>

<style lang="scss" scoped>
.user-name {
  display: inline-flex;

  &--s {
    font-size: var(--font-size-s);
  }

  &--l {
    font-size: var(--font-size-l);
  }

  &__text {
    font-weight: var(--font-weight-medium);
    color: var(--color-text);
  }

  &__link {
    display: inline-flex;
    text-decoration: none;
    color: inherit;
    transition: opacity var(--transition);

    &:hover {
      opacity: 0.8;
    }

    .user-name__text:hover {
      text-decoration: underline;
    }
  }
}
</style>
