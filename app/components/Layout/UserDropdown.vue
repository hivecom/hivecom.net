<script setup lang="ts">
import { Avatar, Button, Divider, Dropdown, DropdownItem, DropdownTitle, Flex, Spinner, Tooltip } from '@dolanske/vui'
import ComplaintsManager from '@/components/Shared/ComplaintsManager.vue'
import RoleIndicator from '@/components/Shared/RoleIndicator.vue'
import SharedThemeToggle from '@/components/Shared/ThemeToggle.vue'
import { useDataUser } from '@/composables/useDataUser'

const user = useSupabaseUser()
const userId = useUserId()

const dropdown = useTemplateRef('dropdown')

// Use cached user data for the current user
const {
  user: userData,
  userInitials,
} = useDataUser(
  userId,
  {
    includeRole: true,
    includeAvatar: true,
    userTtl: 15 * 60 * 1000, // 15 minutes for current user
    avatarTtl: 60 * 60 * 1000, // 1 hour for avatar
  },
)

// Wrapper around navigateTo for dropdown usage
function navigateToWrap(path: string) {
  dropdown.value?.close()
  navigateTo(path)
}

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
  dropdown.value?.close()

  // Defensive check - UserDropdown should only be rendered for authenticated users
  if (!user.value) {
    navigateToWrap('/auth/sign-in')
    return
  }

  showComplaintModal.value = true
}

async function signOut() {
  dropdown.value?.close()

  const supabase = useSupabaseClient()
  await supabase.auth.signOut()
  navigateToWrap('/auth/sign-in')
}
</script>

<template>
  <div class="user-dropdown">
    <Dropdown ref="dropdown" min-width="268px" placement="bottom-end">
      <template #trigger="{ toggle }">
        <Button square plain class="vui-button-accent-weak vui-button-rounded" @click="toggle">
          <Avatar
            :size="30"
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
        </Button>
      </template>
      <DropdownTitle>
        <Flex x-between y-center gap="xs" class="user-dropdown__info">
          <NuxtLink
            to="/profile"
            class="user-dropdown__username"
            :aria-label="`View your profile: ${userData?.username || user?.email}`"
          >
            {{ userData?.username || user?.email }}
          </NuxtLink>
          <RoleIndicator v-if="isAdminOrMod && userData?.role" :role="userData.role" size="s" />
        </Flex>
      </DropdownTitle>

      <NuxtLink to="/profile">
        <DropdownItem>
          <template #icon>
            <Icon name="ph:user" />
          </template>
          Profile
        </DropdownItem>
      </NuxtLink>

      <NuxtLink to="/profile/settings">
        <DropdownItem>
          <template #icon>
            <Icon name="ph:gear-six" />
          </template>
          Settings
        </DropdownItem>
      </NuxtLink>

      <DropdownItem @click="openComplaintModal">
        <template #icon>
          <Icon name="ph:flag" />
        </template>
        Complaints
      </DropdownItem>

      <template v-if="isAdminOrMod">
        <Divider size="2" margin="4px 0" />
        <NuxtLink to="/admin">
          <DropdownItem>
            <template #icon>
              <Icon name="ph:faders" />
            </template>
            Admin Panel
          </DropdownItem>
        </NuxtLink>
      </template>

      <Divider size="2" margin="4px 0" />

      <Flex x-between y-center gap="xs" class="user-dropdown__footer">
        <SharedThemeToggle no-text />
        <Tooltip>
          <template #tooltip>
            <p>
              Sign out
            </p>
          </template>
          <Button square plain aria-label="Sign out" @click="signOut">
            <Icon name="ph:sign-out" />
          </Button>
        </Tooltip>
      </Flex>
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

  &__info {
    width: 100%;
    text-transform: none;
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
    padding: 4px 8px;
    padding-left: 12px;
  }
}
</style>
