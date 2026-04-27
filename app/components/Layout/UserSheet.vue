<script setup lang="ts">
import { Button, Divider, DropdownItem, Flex, Sheet, Spinner } from '@dolanske/vui'
import AvatarMedia from '@/components/Shared/AvatarMedia.vue'
import ComplaintsManager from '@/components/Shared/ComplaintsManager.vue'
import SharedThemeToggle from '@/components/Shared/ThemeToggle.vue'
import UserPreviewCard from '@/components/Shared/UserPreviewCard.vue'
import { useDataUser } from '@/composables/useDataUser'

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

const isAdminOrMod = computed(() => {
  return userData.value?.role === 'admin' || userData.value?.role === 'moderator'
})

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

  // &__nav-item {
  //   display: flex;
  //   align-items: center;
  //   gap: var(--space-s);
  //   padding: var(--space-s) var(--space-m);
  //   border-radius: var(--border-radius-s);
  //   font-size: var(--font-size-m);
  //   color: var(--color-text);
  //   text-decoration: none;
  //   background: none;
  //   border: none;
  //   cursor: pointer;
  //   width: 100%;
  //   text-align: left;
  //   transition: var(--transition);

  //   &:hover {
  //     background-color: color-mix(in srgb, var(--color-accent) 10%, transparent);
  //     color: var(--color-accent);
  //   }

  //   .iconify {
  //     flex-shrink: 0;
  //     color: var(--color-text-light);
  //     transition: var(--transition);
  //   }

  //   &:hover .iconify {
  //     color: var(--color-accent);
  //   }
  // }
}
</style>
