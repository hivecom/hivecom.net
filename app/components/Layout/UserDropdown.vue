<script setup lang="ts">
import { Avatar, Button, Divider, Dropdown, DropdownItem, DropdownTitle, Spinner } from '@dolanske/vui'
import ComplaintsManager from '@/components/Shared/ComplaintsManager.vue'
import RoleIndicator from '@/components/Shared/RoleIndicator.vue'
import { useUserData } from '@/composables/useUserData'

const user = useSupabaseUser()
const userId = useUserId()

// Use cached user data for the current user
const {
  user: userData,
  userInitials,
} = useUserData(
  userId,
  {
    includeRole: true,
    includeAvatar: true,
    userTtl: 15 * 60 * 1000, // 15 minutes for current user
    avatarTtl: 60 * 60 * 1000, // 1 hour for avatar
  },
)

// Complaint modal state
const showComplaintModal = ref(false)

// Check if user is admin or moderator
const isAdminOrMod = computed(() => {
  return userData.value?.role === 'admin' || userData.value?.role === 'moderator'
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
  const supabase = useSupabaseClient()
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
            :alt="userData?.username || 'User profile'"
            :url="userData?.avatarUrl || undefined"
          >
            <template v-if="!userData?.avatarUrl" #default>
              <template v-if="userInitials">
                {{ userInitials }}
              </template>
              <template v-else>
                <Spinner size="s" />
              </template>
            </template>
          </Avatar>
        </button>
      </template>
      <DropdownTitle>
        <div class="user-dropdown__info">
          <NuxtLink
            to="/profile"
            class="user-dropdown__username"
            :aria-label="`View your profile: ${userData?.username || user?.email}`"
          >
            {{ userData?.username || user?.email }}
          </NuxtLink>
          <RoleIndicator v-if="isAdminOrMod && userData?.role" :role="userData.role" size="s" />
        </div>
      </DropdownTitle>
      <DropdownItem @click="navigateTo('/profile')">
        <template #icon>
          <Icon name="ph:user" />
        </template>
        Profile
      </DropdownItem>
      <DropdownItem @click="navigateTo('/profile/settings')">
        <template #icon>
          <Icon name="ph:gear-six" />
        </template>
        Settings
      </DropdownItem>
      <DropdownItem @click="openComplaintModal">
        <template #icon>
          <Icon name="ph:chat-circle-text" />
        </template>
        Complaints
      </DropdownItem>
      <template v-if="isAdminOrMod">
        <Divider size="4" style="margin-bottom: 4px;" />
        <DropdownItem @click="navigateTo('/admin')">
          <template #icon>
            <Icon name="ph:faders" />
          </template>
          Admin Panel
        </DropdownItem>
      </template>
      <Divider size="4" />
      <div class="user-dropdown__footer">
        <SharedThemeToggle no-text />
        <Button square aria-label="Sign out" @click="signOut">
          <Icon name="ph:sign-out" />
        </Button>
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
  .vui-dropdown-title {
    text-transform: none !important;
  }

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
    font-size: var(--font-size-m);
    padding-left: 5px;
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
