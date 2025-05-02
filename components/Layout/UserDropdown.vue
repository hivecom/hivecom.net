<script setup lang="ts">
import { Avatar, Badge, Button, Divider, Dropdown, DropdownItem, DropdownTitle } from '@dolanske/vui'

const supabase = useSupabaseClient()
const user = useSupabaseUser()

// Initialize username ref for profile data
const username = ref('')
// Initialize user role from database
const userRole = ref<string | null>(null)

// Fetch username from profile and role from user_roles
onMounted(async () => {
  if (!user.value)
    return

  // Fetch profile data
  const requestProfile = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.value.id)
    .single()

  username.value = requestProfile.data?.username || ''

  // Fetch user role from user_roles table
  const { error, data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.value.id)
    .single()

  if (error) {
    console.error('Error fetching user role:', error)
    return
  }

  userRole.value = roleData?.role || null
})

// Check if user is admin or moderator
const isAdminOrMod = computed(() => {
  return userRole.value === 'admin' || userRole.value === 'moderator'
})

// Get role display text
const roleDisplay = computed(() => {
  return userRole.value ? userRole.value.charAt(0).toUpperCase() + userRole.value.slice(1) : ''
})

async function signOut() {
  await supabase.auth.signOut()
  navigateTo('/auth/sign-in')
}
</script>

<template>
  <div class="user-dropdown">
    <Dropdown min-width="300px" placement="bottom-end">
      <template #trigger="{ toggle }">
        <button @click="toggle">
          <Avatar src="https://i.imgur.com/65aJ4oG.png" width="32" height="32" :alt="username || 'User profile'" />
        </button>
      </template>
      <DropdownTitle>
        <div class="user-info">
          <NuxtLink to="/profile">
            {{ username || user?.email }}
          </NuxtLink>
          <Badge v-if="isAdminOrMod" variant="info" class="user-badge" :class="userRole">
            {{ roleDisplay }}
          </Badge>
        </div>
      </DropdownTitle>
      <DropdownItem icon="ph:user" @click="navigateTo('/profile')">
        Profile
      </DropdownItem>
      <DropdownItem icon="ph:gear-six" @click="navigateTo('/settings')">
        Settings
      </DropdownItem>
      <template v-if="isAdminOrMod">
        <Divider size="4" style="margin-bottom: 4px;" />
        <DropdownItem icon="ph:faders" @click="navigateTo('/admin')">
          Admin Panel
        </DropdownItem>
      </template>
      <Divider size="4" />
      <div class="user-footer">
        <SharedThemeToggle no-text />
        <Button square icon="ph:sign-out" @click="signOut" />
      </div>
    </Dropdown>
  </div>
</template>

<style lang="scss" scoped>
.user-dropdown {
  img {
    border-radius: 999px;
  }
}

.user-info {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.user-badge {
  &.admin {
    background-color: var(--color-bg-red-lowered);
    color: var(--color-text-red);
  }

  &.moderator {
    background-color: var(--color-bg-blue-lowered);
    color: var(--color-text-blue);
  }
}

.user-footer {
  padding: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

:root.light {
  .user-badge {
    &.admin {
      background-color: var(--color-bg-red-raised);
      color: var(--color-text-invert);
    }

    &.moderator {
      background-color: var(--color-bg-blue-raised);
      color: var(--color-text-invert);
    }
  }
}
</style>
