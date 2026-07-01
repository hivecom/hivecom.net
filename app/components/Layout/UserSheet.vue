<script setup lang="ts">
import type { ImpersonatableRole } from '@/composables/useRoleImpersonation'
import { Button, Divider, Drawer, DropdownItem, Flex, Sheet, Spinner } from '@dolanske/vui'
import AvatarMedia from '@/components/Shared/AvatarMedia.vue'
import ComplaintsManager from '@/components/Shared/ComplaintsManager.vue'
import RoleIndicator from '@/components/Shared/RoleIndicator.vue'
import SharedThemeToggle from '@/components/Shared/ThemeToggle.vue'
import UserPreviewCard from '@/components/Shared/UserPreviewCard.vue'
import { useDataUser } from '@/composables/useDataUser'
import { useEffectiveRole } from '@/composables/useEffectiveRole'
import { useRoleImpersonation } from '@/composables/useRoleImpersonation'

const user = useSupabaseUser()
const userId = useUserId()
const route = useRoute()

const {
  user: userData,
  userInitials,
} = useDataUser(
  userId,
  {
    includeRole: true,
    includeAvatar: true,
    userTtl: 15 * 60 * 1000,
    avatarTtl: 60 * 60 * 1000,
  },
)

const open = ref(false)

watch(() => route.fullPath, () => {
  open.value = false
})

const { isAdminOrMod, isImpersonating, realRole, role } = useEffectiveRole()

const { start: startImpersonation, stop: stopImpersonationFn } = useRoleImpersonation()

const injectedStopImpersonation = inject<() => void>('stopImpersonation', () => {})

const impersonateDrawerOpen = ref(false)

function impersonate(role: ImpersonatableRole) {
  startImpersonation(role)
  impersonateDrawerOpen.value = false
  open.value = false
}

function stopImpersonating() {
  stopImpersonationFn()
  injectedStopImpersonation()
  open.value = false
}

// Complaint modal state
const showComplaintModal = ref(false)

function openComplaintModal() {
  open.value = false

  if (!user.value) {
    navigateTo('/auth/sign-in')
    return
  }

  showComplaintModal.value = true
}

function handleComplaintSubmit(_complaintData: { message: string }) {
  // Could show a success toast here in the future
}

async function signOut() {
  open.value = false

  const supabase = useSupabaseClient()
  await supabase.auth.signOut()
  navigateTo('/auth/sign-in')
}
</script>

<template>
  <div class="user-sheet">
    <Button square plain class="vui-button-accent-weak vui-button-rounded" aria-label="Open user menu" @click="open = true">
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

    <Sheet
      :open="open"
      position="right"
      :card="{ separators: true }"
      :size="400"
      @close="open = false"
    >
      <template #header>
        <Flex x-between y-center expand>
          <h4>Account</h4>
        </Flex>
      </template>

      <Flex column expand class="user-sheet__body" :gap="0">
        <!-- Preview card for the current user -->
        <div class="user-sheet__preview">
          <UserPreviewCard
            :user-id="userId"
            :show-badges="true"
            :show-activity="false"
            :show-description="false"
            :role-override="isAdminOrMod ? role : null"
            :impersonating="isImpersonating"
          />
        </div>

        <Divider class="my-s" />

        <!-- Navigation items -->
        <Flex column expand gap="xxs" class="user-sheet__nav">
          <NuxtLink to="/profile" class="w-100">
            <DropdownItem>
              <template #icon>
                <Icon name="ph:user" :size="18" />
              </template>
              Profile
            </DropdownItem>
          </NuxtLink>

          <NuxtLink to="/themes" class="w-100">
            <DropdownItem>
              <template #icon>
                <Icon name="ph:circle-half-tilt-fill" :size="18" />
              </template>
              Themes
            </DropdownItem>
          </NuxtLink>

          <NuxtLink to="/sharing" class="w-100">
            <DropdownItem>
              <template #icon>
                <Icon name="ph:share-network" :size="18" />
              </template>
              Sharing
            </DropdownItem>
          </NuxtLink>

          <NuxtLink to="/profile/settings" class="w-100">
            <DropdownItem>
              <template #icon>
                <Icon name="ph:gear-six" :size="18" />
              </template>
              Settings
            </DropdownItem>
          </NuxtLink>

          <DropdownItem @click="openComplaintModal">
            <template #icon>
              <Icon name="ph:flag" :size="18" />
            </template>
            Complaints
          </DropdownItem>

          <template v-if="isAdminOrMod">
            <Divider class="my-s" />
            <NuxtLink to="/admin" class="w-100">
              <DropdownItem>
                <template #icon>
                  <Icon name="ph:faders" :size="18" />
                </template>
                Admin Panel
              </DropdownItem>
            </NuxtLink>
            <DropdownItem v-if="realRole === 'admin' && !isImpersonating" expand @click="impersonateDrawerOpen = true">
              <template #icon>
                <Icon name="ph:user-circle-dashed" :size="18" />
              </template>
              Impersonate
            </DropdownItem>
            <Drawer :open="impersonateDrawerOpen" @close="impersonateDrawerOpen = false">
              <h4>Impersonate</h4>
              <p class="text-xs text-color-light mt-xxs">
                Temporarily assume the <b>visual</b> permissions of another role for testing purposes. Your session is unaffected - switch back at any time.
              </p>
              <p class="text-xs text-color-light mt-s">
                <i>Note: Client-side only. API responses are not altered. Verify with real accounts when testing permissions.</i>
              </p>
              <Divider class="my-m" />
              <Flex column gap="xs">
                <DropdownItem expand @click="impersonate('moderator')">
                  <RoleIndicator role="moderator" size="l" />
                </DropdownItem>
                <DropdownItem expand @click="impersonate('user')">
                  <RoleIndicator role="user" size="l" />
                </DropdownItem>
                <template v-if="isImpersonating">
                  <Divider class="my-xxs" />
                  <DropdownItem expand @click="stopImpersonating">
                    <template #icon>
                      <Icon name="ph:arrow-counter-clockwise" />
                    </template>
                    Reset
                  </DropdownItem>
                </template>
              </Flex>
            </Drawer>
          </template>
        </Flex>
      </Flex>

      <template #footer>
        <Flex x-between y-center expand>
          <SharedThemeToggle no-text />
          <Button icon @click="signOut">
            <template #start>
              <Icon name="ph:sign-out" />
            </template>
            Sign out
          </Button>
        </Flex>
      </template>
    </Sheet>

    <ComplaintsManager
      v-model:open="showComplaintModal"
      @submit="handleComplaintSubmit"
    />
  </div>
</template>

<style scoped lang="scss">
.user-sheet {
  &__body {
    width: 100%;
  }

  &__preview {
    width: 100%;

    // Override the fixed width baked into UserPreviewCard so it fills the sheet
    :deep(.user-preview-card) {
      width: 100%;
    }
  }

  &__nav {
    padding: var(--space-xxs) 0;
    width: 100%;
  }
}
</style>
