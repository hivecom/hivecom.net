<script setup lang="ts">
import { Avatar, Badge, Flex } from '@dolanske/vui'
import { computed } from 'vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import UserName from '@/components/Shared/UserName.vue'
import UserRole from '@/components/Shared/UserRole.vue'
import { useCacheUserData } from '@/composables/useCacheUserData'

interface Props {
  userId?: string | null
  showRole?: boolean
  size?: 's' | 'm' | 'l'
  showProfilePreview?: boolean
  hideAvatar?: boolean
  centered?: boolean
  /**
   * Pre-resolved role. When provided it is passed straight to UserRole,
   * skipping the per-component cache lookup entirely.
   */
  role?: string | null
  /**
   * Pre-resolved username. When provided alongside avatarUrl, UserDisplay
   * does NOT call useCacheUserData at all - it forwards the data straight to
   * UserName and UserAvatar, avoiding N individual profile queries in lists.
   * If either is omitted, the normal per-component cache path is used.
   */
  username?: string | null
  avatarUrl?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  showRole: false,
  size: 'm',
  showProfilePreview: true,
  hideAvatar: false,
  role: undefined,
  username: undefined,
  avatarUrl: undefined,
})

// Only do a cache lookup when the parent hasn't already supplied the resolved
// profile data.  When username is provided we skip entirely - the parent
// (e.g. the forum index pre-warmed via useBulkUserData) is the source of truth.
const needsFetch = computed(() => props.username === undefined || props.username === null)

const { user } = useCacheUserData(
  computed(() => needsFetch.value ? (props.userId ?? null) : null),
  {
    includeRole: false, // role is handled separately via the `role` prop or UserRole
    includeAvatar: !props.hideAvatar,
    userTtl: 10 * 60 * 1000,
    avatarTtl: 30 * 60 * 1000,
  },
)

// Resolved display values: prefer explicit props, fall back to cache result.
const resolvedUsername = computed(() =>
  props.username !== undefined ? props.username : (user.value?.username ?? null),
)
const resolvedAvatarUrl = computed(() =>
  props.avatarUrl !== undefined ? props.avatarUrl : (user.value?.avatarUrl ?? null),
)
const resolvedUsernameSet = computed(() =>
  user.value?.username_set ?? false,
)
</script>

<template>
  <div class="user-display">
    <Flex gap="s" y-center x-center class="user-display__header">
      <!-- Avatar -->
      <template v-if="!hideAvatar">
        <!-- System avatar (no userId) -->
        <Avatar v-if="!userId" :size="size" url="/icon.svg" />
        <!-- User avatar - pass resolved data when available to avoid a second fetch -->
        <UserAvatar
          v-else
          :user-id="userId"
          :size="size"
          linked
          :show-preview="showProfilePreview"
          :resolved-avatar-url="resolvedAvatarUrl"
          :resolved-username="resolvedUsername"
          :resolved-username-set="resolvedUsernameSet"
        />
      </template>

      <!-- Name & role -->
      <div class="user-display__info">
        <Flex
          gap="xs"
          :x-start="!centered"
          :x-center="!!centered"
          y-center
          wrap
          class="user-display__name-row"
        >
          <UserName
            :user-id="userId"
            :size="size"
            :resolved-username="resolvedUsername"
            :resolved-username-set="resolvedUsernameSet"
          >
            <Badge v-if="!userId" size="xs" variant="accent">
              System
            </Badge>
          </UserName>
          <UserRole v-if="showRole && userId" :user-id="userId" :role="role" size="s" />
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
