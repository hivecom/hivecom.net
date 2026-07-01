<script setup lang="ts">
import type { ImpersonatableRole } from '@/composables/useRoleImpersonation'
import { Button, Divider, Dropdown, DropdownItem, DropdownTitle, Flex, Popout, Spinner, Tooltip } from '@dolanske/vui'
import { ref } from 'vue'
import AvatarMedia from '@/components/Shared/AvatarMedia.vue'
import ComplaintsManager from '@/components/Shared/ComplaintsManager.vue'
import RoleIndicator from '@/components/Shared/RoleIndicator.vue'
import SharedThemeToggle from '@/components/Shared/ThemeToggle.vue'
import { useDataUser } from '@/composables/useDataUser'
import { useEffectiveRole } from '@/composables/useEffectiveRole'
import { useRoleImpersonation } from '@/composables/useRoleImpersonation'

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

// Effective role respects impersonation
const { isAdminOrMod, role, isImpersonating, realRole } = useEffectiveRole()

const impersonatePopoutAnchor = ref<HTMLElement | null>(null)
const impersonatePopoutOpen = ref(false)

function toggleImpersonatePopout() {
  impersonatePopoutOpen.value = !impersonatePopoutOpen.value
}

// Impersonation controls
const { start: startImpersonation, stop: stopImpersonationFn } = useRoleImpersonation()

const injectedStopImpersonation = inject<() => void>('stopImpersonation', () => {})

function impersonate(role: ImpersonatableRole) {
  startImpersonation(role)
  impersonatePopoutOpen.value = false
  dropdown.value?.close()
}

function stopImpersonating() {
  stopImpersonationFn()
  injectedStopImpersonation()
  dropdown.value?.close()
}

// Handle complaint submission
function handleComplaintSubmit(_complaintData: { message: string }) {
  // Could show a success toast here in the future
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
          <AvatarMedia
            :size="30"
            :alt="userData?.username || 'User profile'"
            :url="userData?.avatarUrl || undefined"
          >
            <template v-if="userInitials">
              {{ userInitials }}
            </template>
            <template v-else>
              <Spinner size="s" />
            </template>
          </AvatarMedia>
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
          <Flex gap="xxs" y-center>
            <RoleIndicator
              v-if="isAdminOrMod && userData?.role"
              :role="role"
              size="s"
            >
              {{ isImpersonating ? ' *' : '' }}
            </RoleIndicator>
            <template v-if="realRole === 'admin' && !isImpersonating">
              <Button ref="impersonatePopoutAnchor" square plain size="s" aria-label="Impersonate role" @click.stop="toggleImpersonatePopout">
                <Icon name="ph:user-circle-dashed" />
              </Button>
              <Popout
                :anchor="impersonatePopoutAnchor"
                :visible="impersonatePopoutOpen"
                placement="left-start"
                @click-outside="impersonatePopoutOpen = false"
              >
                <div class="vui-dropdown">
                  <DropdownTitle>
                    <Flex expand x-between y-center>
                      <span class="text-xs">Impersonate</span>
                      <Tooltip>
                        <template #tooltip>
                          <p class="text-xs">
                            Temporarily assume the <b>visual</b> permissions of another role for testing purposes. Your current session will be unaffected and you can switch back at any time.
                          </p>
                          <p class="text-xs mt-s">
                            <i>
                              Note: This is purely a client-side visual change and not an effective way to test RLS policies, as API responses will not be altered. Use with caution and always verify with real accounts when testing permissions.
                            </i>
                          </p>
                        </template>
                        <Icon name="ph:question" class="ml-xxs" />
                      </Tooltip>
                    </Flex>
                  </DropdownTitle>
                  <DropdownItem @click="impersonate('moderator')">
                    <RoleIndicator role="moderator" tiny />
                  </DropdownItem>
                  <DropdownItem @click="impersonate('user')">
                    <RoleIndicator role="user" tiny />
                  </DropdownItem>
                  <template v-if="isImpersonating">
                    <Divider class="my-xxs" />
                    <DropdownItem @click="stopImpersonating">
                      <template #icon>
                        <Icon name="ph:arrow-counter-clockwise" />
                      </template>
                      Reset
                    </DropdownItem>
                  </template>
                </div>
              </Popout>
            </template>
          </Flex>
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

      <NuxtLink to="/themes">
        <DropdownItem>
          <template #icon>
            <Icon name="ph:circle-half-tilt-fill" />
          </template>
          Themes
        </DropdownItem>
      </NuxtLink>

      <NuxtLink to="/sharing">
        <DropdownItem>
          <template #icon>
            <Icon name="ph:share-network" />
          </template>
          Sharing
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
        <Divider class="my-xxs" />

        <NuxtLink to="/admin">
          <DropdownItem>
            <template #icon>
              <Icon name="ph:faders" />
            </template>
            Admin Panel
          </DropdownItem>
        </NuxtLink>
      </template>

      <Divider class="my-xxs" />

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
    border-radius: var(--border-radius-pill);
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

  &__impersonate-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    padding: 2px;
    cursor: pointer;
    color: var(--color-text-lighter);
    line-height: 0;
    border-radius: var(--border-radius-s);
    transition: color var(--transition);

    svg {
      transition: transform var(--transition);
    }

    &.is-open svg {
      transform: rotate(180deg);
    }

    &:hover {
      color: var(--color-text);
    }
  }

  &__footer {
    padding: 4px 8px;
    padding-left: 12px;
  }
}
</style>
