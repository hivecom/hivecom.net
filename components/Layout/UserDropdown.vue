<script setup lang="ts">
import { Avatar, Button, Divider, Dropdown, DropdownItem, DropdownTitle } from '@dolanske/vui'
import ComplaintsManager from '@/components/Shared/ComplaintsManager.vue'
import RoleIndicator from '@/components/Shared/RoleIndicator.vue'
import { getUserAvatarUrl } from '~/utils/storage'

const supabase = useSupabaseClient()
const user = useSupabaseUser()

// Initialize username ref for profile data
const username = ref('')
// Initialize user role from database
const userRole = ref<string | null>(null)
// Avatar URL state
const avatarUrl = ref<string | null>(null)

// Complaint modal state
const showComplaintModal = ref(false)

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

  // Fetch user avatar URL
  avatarUrl.value = await getUserAvatarUrl(supabase, user.value.id)

  // Fetch user role from user_roles table
  const { error, data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.value.id)
    .single()

  if (error) {
    console.error('Error fetching user role:', error)
  }
  else {
    userRole.value = roleData?.role || null
  }
})

// Check if user is admin or moderator
const isAdminOrMod = computed(() => {
  return userRole.value === 'admin' || userRole.value === 'moderator'
})

// Handle complaint submission
function handleComplaintSubmit(_complaintData: { message: string }) {
  // Could show a success toast here in the future
  // For now, just handle the successful submission
}

function openComplaintModal() {
  // Defensive check - UserDropdown should only be rendered for authenticated users
  if (!user.value) {
    navigateTo('/auth/sign-in')
    return
  }

  showComplaintModal.value = true
}

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
          <Avatar
            width="32"
            height="32"
            :alt="username || 'User profile'"
            :url="avatarUrl || undefined"
          >
            <template v-if="!avatarUrl" #default>
              {{ username ? username.charAt(0).toUpperCase() : '?' }}
            </template>
          </Avatar>
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
      <DropdownItem icon="ph:chat-circle-text" @click="openComplaintModal">
        Complaints
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
    <ComplaintsManager
      v-model:open="showComplaintModal"
      @submit="handleComplaintSubmit"
    />
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
