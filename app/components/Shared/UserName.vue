<script setup lang="ts">
import { Badge, Flex, Skeleton } from '@dolanske/vui'
import { useCacheUserData } from '@/composables/useCacheUserData'
import { getAnonymousUsername } from '@/lib/anonymous-usernames'

interface UserData {
  id: string
  username: string
}

interface Props {
  userId?: string | null
  /**
   * Pre-fetched user data. When provided, the component skips internal
   * fetching and renders whatever it receives (controlled mode).
   */
  userData?: UserData | null
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

// ---------------------------------------------------------------------------
// Mode detection
// ---------------------------------------------------------------------------
// `userData` explicitly provided (even `null`) → controlled mode.
// `userData` left `undefined` → standalone / self-fetching mode.
const isControlled = computed(() => props.userData !== undefined)

// ---------------------------------------------------------------------------
// Standalone fetching
// ---------------------------------------------------------------------------
const shouldFetch = computed(() => !isControlled.value && !!props.userId)

const {
  user: fetchedUser,
  loading,
} = useCacheUserData(
  computed(() => shouldFetch.value ? props.userId : null),
  {
    includeRole: false,
    includeAvatar: false,
    userTtl: 10 * 60 * 1000,
    avatarTtl: 30 * 60 * 1000,
  },
)

// ---------------------------------------------------------------------------
// Auth & anonymous handling
// ---------------------------------------------------------------------------
const currentUser = useSupabaseUser()

const anonymousUsername = computed(() =>
  props.userId ? getAnonymousUsername(props.userId) : null,
)

// ---------------------------------------------------------------------------
// Resolved display values
// ---------------------------------------------------------------------------
const resolvedUsername = computed<string | null>(() => {
  // Unauthenticated users see anonymous names for privacy
  if (!currentUser.value && props.userId) {
    return anonymousUsername.value
  }

  if (isControlled.value) {
    return props.userData?.username ?? null
  }

  return fetchedUser.value?.username ?? null
})

const resolvedId = computed<string | null>(() => {
  if (isControlled.value) {
    return props.userData?.id ?? props.userId ?? null
  }
  return fetchedUser.value?.id ?? props.userId ?? null
})

const profileLink = computed(() => {
  if (!resolvedId.value)
    return null
  return `/profile/${resolvedId.value}`
})

const canLink = computed(() => {
  return !props.noLink && !!currentUser.value && !!profileLink.value
})

const showSkeleton = computed(() => {
  return shouldFetch.value && loading.value
})

const ariaLabel = computed(() => {
  return resolvedUsername.value
    ? `View profile of ${resolvedUsername.value}`
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
  <!-- Loading (standalone mode only) -->
  <Skeleton v-if="showSkeleton" width="108px" height="20px" />

  <!-- Resolved username -->
  <Flex
    v-else-if="resolvedUsername"
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
      <span class="user-name__text">{{ resolvedUsername }}</span>
    </NuxtLink>
    <span v-else class="user-name__text">{{ resolvedUsername }}</span>

    <!-- Slot for extra inline content (e.g. System badge, role indicator) -->
    <slot />
  </Flex>

  <!-- System fallback when no userId and not controlled -->
  <Flex
    v-else-if="!userId && !isControlled"
    gap="xs"
    y-center
    class="user-name"
    :class="fontClass"
  >
    <span class="user-name__text">Hivecom</span>
    <Badge size="xs" variant="accent">
      System
    </Badge>
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
