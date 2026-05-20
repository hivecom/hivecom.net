<script setup lang="ts">
import type { AdminUserProfile } from '@/composables/useAdminUserTableData'
import { Alert, Flex, Tab, Tabs } from '@dolanske/vui'
import { computed, ref } from 'vue'
import RolesGrid from '@/components/Admin/Roles/RolesGrid.vue'

import AdminGlobe from '@/components/Admin/Users/AdminGlobe.vue'
import UserDetails from '@/components/Admin/Users/UserDetails.vue'
import UserForm from '@/components/Admin/Users/UserForm.vue'
import UserKPIs from '@/components/Admin/Users/UserKPIs.vue'
import UserTable from '@/components/Admin/Users/UserTable.vue'
import { useAdminPermissions } from '@/composables/useAdminPermissions'
import { useDataProfileBadges } from '@/composables/useDataProfileBadges'
import { BADGE_CATALOG } from '@/lib/badges/catalog'
import { getRouteQueryString } from '@/lib/utils/common'

definePageMeta({ layout: 'admin' })

interface UserAction {
  user: AdminUserProfile
  type: 'ban' | 'unban' | 'edit' | 'delete' | null
  banDuration?: string
  banReason?: string
}

type ActionType = NonNullable<UserAction['type']>

// Interface for user form data
interface UserFormData {
  role?: string
  [key: string]: unknown
}

// Get admin permissions and current user
const {
  canViewUsers,
  canViewRoles,
  canUpdateRoles,
  isAdmin,
} = useAdminPermissions()

const route = useRoute()
const router = useRouter()

const currentUser = useSupabaseUser()
const currentUserId = useUserId()
const supabase = useSupabaseClient()

// Ensure user has permission to view at least one tab
if (!canViewUsers.value && !canViewRoles.value) {
  throw createError({
    statusCode: 403,
    statusMessage: 'Insufficient permissions to view users or roles',
  })
}

// Tab management (pattern aligned with admin/network)
const availableTabs = computed(() => {
  const tabs: { label: string, value: 'Users' | 'Roles' | 'Globe' }[] = []
  if (canViewUsers.value)
    tabs.push({ label: 'Users', value: 'Users' })
  if (canViewRoles.value)
    tabs.push({ label: 'Roles', value: 'Roles' })
  if (canViewUsers.value)
    tabs.push({ label: 'Globe', value: 'Globe' })
  return tabs
})

const { activeTab } = useAdminTabs(availableTabs)

const focusedUserId = computed(() => {
  return getRouteQueryString(route.query.user)
})

const pageTitle = 'Users & Roles'
const canViewUserEmails = computed(() => isAdmin.value)

const pageSubtitle = computed(() => {
  if (activeTab.value === 'Roles')
    return 'View role-based permissions and access control matrix'
  return 'Manage user accounts, permissions, and ban status'
})

// Reactive state
const selectedUser = ref<AdminUserProfile | null>(null)
const showUserDetails = ref(false)
const userDetailsRef = ref<{ refreshBadges: () => Promise<void> } | null>(null)
const userAction = ref<UserAction | null>(null)
const refreshSignal = ref(0)
const countryFilter = ref('')
const userRefreshTrigger = ref(false)
const detailActionLoading = ref<Partial<Record<ActionType, boolean>>>({})

// UserForm state
const showUserForm = ref(false)
const isEditMode = ref(false)
const userToEdit = ref<AdminUserProfile | null>(null)
const { invalidate: invalidateProfileBadges } = useDataProfileBadges(null)

function handleCountryClick(iso: string) {
  activeTab.value = 'Users'
  countryFilter.value = iso
}

// Close the details panel when leaving the Users tab.
watch(activeTab, (tab) => {
  if (tab !== 'Users')
    showUserDetails.value = false
})

watch(showUserDetails, (isOpen) => {
  if (isOpen && selectedUser.value) {
    const nextQuery = {
      ...route.query,
      tab: 'Users',
      user: selectedUser.value.id,
    }
    router.replace({ query: nextQuery })
    return
  }

  if (isOpen)
    return

  if (!route.query.user)
    return

  const { user, ...rest } = route.query
  router.replace({ query: rest })
})

// Handle user selection from table
function handleUserSelected(user: AdminUserProfile) {
  selectedUser.value = user
  showUserDetails.value = true
}

// Handle refresh events from UserTable
function handleRefreshSignal(value: number) {
  refreshSignal.value = value
}

// Watch for user refresh trigger and update the main refresh signal
watch(userRefreshTrigger, (shouldRefresh) => {
  if (shouldRefresh) {
    refreshSignal.value++
    userRefreshTrigger.value = false
  }
})

watch(() => selectedUser.value?.id, () => {
  detailActionLoading.value = {}
})

// Watch for userAction changes from UserDetails to handle edit actions
watch(userAction, (action) => {
  if (action && action.type) {
    handleUserAction(action)
    // Reset the action after handling it
    userAction.value = null
  }
})

// Handle user actions - updated to handle edit actions at table level
async function handleUserAction(action: UserAction) {
  if (!action || !action.type)
    return

  // Handle edit action at table level
  if (action.type === 'edit') {
    userToEdit.value = action.user
    isEditMode.value = true
    showUserForm.value = true
    showUserDetails.value = false // Close UserDetails when opening edit form
    return
  }

  // Handle ban action
  if (action.type === 'ban') {
    try {
      await runActionWithDetailLoading(action, 'ban', async () => {
        const { error } = await supabase.functions.invoke('admin-user-ban', {
          method: 'POST',
          body: {
            userId: action.user.id,
            banDuration: action.banDuration,
            banReason: action.banReason,
          },
        })

        if (error)
          throw error

        // Trigger refresh after successful ban
        refreshSignal.value++
      })
    }
    catch (error: unknown) {
      console.error('Error banning user:', (error as Error).message)
      // You might want to show an error toast/notification here
    }
    return
  }

  // Handle unban action
  if (action.type === 'unban') {
    try {
      await runActionWithDetailLoading(action, 'unban', async () => {
        const { error } = await supabase.functions.invoke('admin-user-ban', {
          method: 'POST',
          body: {
            userId: action.user.id,
            banDuration: 'none', // Special value to unban
          },
        })

        if (error)
          throw error

        // Trigger refresh after successful unban
        refreshSignal.value++
      })
    }
    catch (error: unknown) {
      console.error('Error unbanning user:', (error as Error).message)
      // You might want to show an error toast/notification here
    }
    return
  }

  // Handle delete action
  if (action.type === 'delete') {
    try {
      await runActionWithDetailLoading(action, 'delete', async () => {
        const { error } = await supabase.functions.invoke('admin-user-delete', {
          method: 'POST',
          body: {
            userId: action.user.id,
          },
        })

        if (error)
          throw error

        if (selectedUser.value?.id === action.user.id) {
          selectedUser.value = null
          showUserDetails.value = false
        }

        // Trigger refresh after successful delete
        refreshSignal.value++
      })
    }
    catch (error: unknown) {
      console.error('Error deleting user:', (error as Error).message)
      // You might want to show an error toast/notification here
    }
    return
  }

  // The action will be handled by the components themselves
  userAction.value = action

  // Trigger refresh after action
  setTimeout(() => {
    refreshSignal.value++
    userAction.value = null
  }, 1500)
}

// Handle edit from UserDetails
function handleEditFromDetails(user: AdminUserProfile) {
  userToEdit.value = user
  isEditMode.value = true
  showUserForm.value = true
  showUserDetails.value = false
}

// Handle save from UserForm
async function handleUserSave(userData: UserFormData, badges: string[], currentBadges: string[]) {
  try {
    const supabase = useSupabaseClient()

    if (!userToEdit.value)
      return

    // Extract role from userData (single role management)
    const { role, badges: _badges, ...profileData } = userData

    // Update user profile data
    const { error: profileError } = await supabase
      .from('profiles')
      .update(profileData)
      .eq('id', userToEdit.value.id)

    if (profileError)
      throw profileError

    // Handle role update if role is provided
    if (role !== undefined) {
      // Security checks for role modification
      if (!canUpdateRoles.value) {
        throw new Error('Insufficient permissions to modify user roles')
      }

      // Prevent users from modifying their own role
      if (currentUser.value && currentUserId.value === userToEdit.value.id) {
        throw new Error('You cannot modify your own role')
      }

      // First, remove any existing roles for this user
      const { error: deleteError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userToEdit.value.id)

      if (deleteError)
        throw deleteError

      // If role is not 'user', insert the new role
      if (role !== 'user') {
        const { error: insertError } = await supabase
          .from('user_roles')
          .insert({
            user_id: userToEdit.value.id,
            role: role as 'admin' | 'moderator',
          })

        if (insertError)
          throw insertError
      }
    }

    // Apply manual badge changes via RPCs
    if (userToEdit.value && badges !== undefined) {
      const profileId = userToEdit.value.id
      const currentBadgeSlugs = new Set(currentBadges)
      const newBadgeSlugs = new Set(badges)
      const manualSlugs = ['builder', 'earlybird', 'founder', 'host']

      // Grant newly added badges
      for (const slug of manualSlugs) {
        if (newBadgeSlugs.has(slug) && !currentBadgeSlugs.has(slug)) {
          const entry = BADGE_CATALOG[slug as keyof typeof BADGE_CATALOG]
          const tier = entry && entry.kind !== 'computed' ? entry.defaultTier : undefined
          const { error: setError } = await supabase.rpc('admin_set_profile_badge', {
            p_profile_id: profileId,
            p_slug: slug,
            ...(tier ? { p_tier: tier } : {}),
          })
          if (setError)
            throw setError
        }
      }

      // Revoke removed badges
      for (const slug of manualSlugs) {
        if (!newBadgeSlugs.has(slug) && currentBadgeSlugs.has(slug)) {
          const { error: removeError } = await supabase.rpc('admin_remove_profile_badge', {
            p_profile_id: profileId,
            p_slug: slug,
          })
          if (removeError)
            throw removeError
        }
      }

      invalidateProfileBadges(profileId)
      void userDetailsRef.value?.refreshBadges()
    }

    // Close the form and refresh data
    showUserForm.value = false
    refreshSignal.value++

    // User updated successfully
  }
  catch (error: unknown) {
    console.error('Error updating user:', (error as Error).message)
    // Handle error (you might want to show error message to user)
  }
}

// Handle delete from UserForm - delegates to the edge function so all cleanup runs
async function handleUserDelete(userId: string) {
  try {
    const { error } = await supabase.functions.invoke('admin-user-delete', {
      method: 'POST',
      body: { userId },
    })

    if (error)
      throw error

    // Close form and refresh data
    showUserForm.value = false
    refreshSignal.value++
  }
  catch (error: unknown) {
    console.error('Error deleting user:', (error as Error).message)
  }
}

function setDetailActionLoading(actionType: ActionType, state: boolean) {
  detailActionLoading.value = {
    ...detailActionLoading.value,
    [actionType]: state,
  }
}

async function runActionWithDetailLoading(action: UserAction, actionType: ActionType, operation: () => Promise<void>) {
  const shouldShowDetailLoading = selectedUser.value?.id === action.user.id

  if (shouldShowDetailLoading)
    setDetailActionLoading(actionType, true)

  try {
    await operation()
  }
  finally {
    if (shouldShowDetailLoading)
      setDetailActionLoading(actionType, false)
  }
}
</script>

<template>
  <div>
    <Flex column gap="l" expand>
      <!-- Page Header -->
      <Flex column :gap="0">
        <h1>{{ pageTitle }}</h1>
        <p class="text-color-light">
          {{ pageSubtitle }}
        </p>
      </Flex>

      <Tabs v-if="availableTabs.length > 1" v-model="activeTab">
        <Tab v-for="tab in availableTabs" :key="tab.value" :value="tab.value">
          {{ tab.label }}
        </Tab>
      </Tabs>

      <Alert v-if="availableTabs.length === 0" variant="info">
        You don't have permission to view users or roles.
      </Alert>

      <!-- Users Tab -->
      <Flex v-if="canViewUsers" v-show="activeTab === 'Users'" column gap="l" expand>
        <UserKPIs v-model:refresh-signal="refreshSignal" />

        <UserTable
          v-model:refresh-signal="refreshSignal"
          v-model:country-filter="countryFilter"
          :can-view-user-emails="canViewUserEmails"
          :focus-user-id="focusedUserId"
          @user-selected="handleUserSelected"
          @action="handleUserAction"
          @update:refresh-signal="handleRefreshSignal"
        />
      </Flex>

      <!-- Roles Tab -->
      <Flex v-if="canViewRoles" v-show="activeTab === 'Roles'" column gap="m" expand>
        <RolesGrid />
      </Flex>
    </Flex>
    <!-- Globe Tab -->
    <AdminGlobe v-show="activeTab === 'Globe'" @country-click="handleCountryClick" />

    <!-- User Details Side Panel -->
    <UserDetails
      v-if="activeTab === 'Users'"
      ref="userDetailsRef"
      v-model:is-open="showUserDetails"
      v-model:user-action="userAction"
      v-model:refresh-user="userRefreshTrigger"
      :user="selectedUser"
      :can-view-user-emails="canViewUserEmails"
      :action-loading="detailActionLoading"
      @edit="handleEditFromDetails"
    />

    <!-- User Form Modal -->
    <UserForm
      v-if="showUserForm"
      v-model:is-open="showUserForm"
      :user="userToEdit"
      :is-edit-mode="isEditMode"
      @save="handleUserSave"
      @delete="handleUserDelete"
    />
  </div>
</template>

<style lang="scss" scoped>
</style>
