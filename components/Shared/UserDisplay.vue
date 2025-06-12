<script setup lang="ts">
import { Avatar, Flex } from '@dolanske/vui'
import { onMounted, ref, watch } from 'vue'
import RoleIndicator from '@/components/Shared/RoleIndicator.vue'

interface Props {
  userId?: string | null
  showRole?: boolean
  size?: 's' | 'm' | 'l'
}

const props = withDefaults(defineProps<Props>(), {
  showRole: false,
  size: 'm',
})

const supabase = useSupabaseClient()
const currentUser = useSupabaseUser()
const user = ref<{ id: string, username: string, role: string | null } | null>(null)
const loading = ref(true)
const error = ref(false)

// Fetch user data
async function fetchUserData() {
  if (!props.userId) {
    loading.value = false
    return
  }

  // Only fetch user data if current user is authenticated
  if (!currentUser.value) {
    loading.value = false
    return
  }

  try {
    // Fetch profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('id', props.userId)
      .single()

    if (profileError) {
      throw profileError
    }

    // Fetch role if requested
    let role = null
    if (props.showRole) {
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', props.userId)
        .single()

      role = roleData?.role || null
    }

    user.value = {
      id: props.userId,
      username: profile?.username || 'Unknown',
      role,
    }
  }
  catch (err) {
    console.error('Failed to fetch user data:', err)
    error.value = true
  }
  finally {
    loading.value = false
  }
}

// Get user initials for avatar
function getUserInitials(username: string): string {
  return username
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

onMounted(() => {
  fetchUserData()
})

// Watch for authentication state changes
watch(currentUser, () => {
  fetchUserData()
}, { immediate: false })
</script>

<template>
  <div class="user-display">
    <!-- Unauthenticated user state -->
    <Flex v-if="!currentUser" gap="m" y-center class="user-display__header" />

    <!-- Loading state -->
    <Flex v-else-if="loading" gap="m" y-center class="user-display__header">
      <Avatar :size="size">
        ?
      </Avatar>
      <div class="user-display__info">
        <span class="user-display__username user-display__username--loading">Loading...</span>
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
      <NuxtLink
        :to="`/profile/${user.id}`"
        class="user-display__link"
        :aria-label="`View profile of ${user.username}`"
      >
        <Avatar :size="size">
          {{ getUserInitials(user.username) }}
        </Avatar>
      </NuxtLink>
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

    &--loading {
      color: var(--color-text-lighter);
    }

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
}
</style>
