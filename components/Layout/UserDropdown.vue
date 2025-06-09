<script setup lang="ts">
import { Avatar, Button, Divider, Dropdown, DropdownItem, DropdownTitle } from '@dolanske/vui'
import RoleIndicator from '@/components/Shared/RoleIndicator.vue'

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

async function signOut() {
  await supabase.auth.signOut()
  navigateTo('/auth/sign-in')
}
</script>

<template>
  <div class="user-dropdown">
    <Dropdown min-width="300px" placement="bottom-end">
      <template #trigger="{ toggle }">
        <button class="user-dropdown__trigger" @click="toggle">
          <Avatar src="https://i.imgur.com/65aJ4oG.png" width="32" height="32" :alt="username || 'User profile'" />
        </button>
      </template>
      <DropdownTitle>
        <div class="user-dropdown__info">
          <NuxtLink
            to="/profile"
            class="user-dropdown__username"
            :aria-label="`View your profile: ${username || user?.email}`"
          >
            {{ username || user?.email }}
          </NuxtLink>
          <RoleIndicator v-if="isAdminOrMod && userRole" :role="userRole" size="s" />
        </div>
      </DropdownTitle>
      <DropdownItem icon="ph:user" @click="navigateTo('/profile')">
        Profile
      </DropdownItem>
      <DropdownItem icon="ph:gear-six" @click="navigateTo('/profile/settings')">
        Settings
      </DropdownItem>
      <template v-if="isAdminOrMod">
        <Divider size="4" style="margin-bottom: 4px;" />
        <DropdownItem icon="ph:faders" @click="navigateTo('/admin')">
          Admin Panel
        </DropdownItem>
      </template>
      <Divider size="4" />
      <div class="user-dropdown__footer">
        <SharedThemeToggle no-text />
        <Button square icon="ph:sign-out" aria-label="Sign out" @click="signOut" />
      </div>
    </Dropdown>
  </div>
</template>

<style lang="scss" scoped>
.user-dropdown {
  img {
    border-radius: 999px;
  }

  &__trigger {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }

  &__info {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  &__username {
    text-decoration: none;
    color: inherit;

    &:hover {
      text-decoration: underline;
    }
  }

  &__footer {
    padding: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
}
</style>
