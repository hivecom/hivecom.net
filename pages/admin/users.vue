<script setup lang="ts">
import { Flex } from '@dolanske/vui'

import UserDetails from '~/components/Admin/Users/UserDetails.vue'
import UserForm from '~/components/Admin/Users/UserForm.vue'
import UserKPIs from '~/components/Admin/Users/UserKPIs.vue'
import UserTable from '~/components/Admin/Users/UserTable.vue'

// Get admin permissions and current user
const {
  canViewUsers,
  canUpdateRoles,
} = useAdminPermissions()

const currentUser = useSupabaseUser()
const supabase = useSupabaseClient()

// Ensure user has at least read permission for users
if (!canViewUsers.value) {
  throw createError({
    statusCode: 403,
    statusMessage: 'Insufficient permissions to view users',
  })
}

// Reactive state
const selectedUser = ref<any>(null)
const showUserDetails = ref(false)
const userAction = ref<any>(null)
const refreshSignal = ref(0)
const userRefreshTrigger = ref(false)

// UserForm state
const showUserForm = ref(false)
const isEditMode = ref(false)
const userToEdit = ref<any>(null)

// Handle user selection from table
function handleUserSelected(user: any) {
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

// Watch for userAction changes from UserDetails to handle edit actions
watch(userAction, (action) => {
  if (action && action.type) {
    handleUserAction(action)
    // Reset the action after handling it
    userAction.value = null
  }
})

// Handle user actions - updated to handle edit actions at table level
async function handleUserAction(action: any) {
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
    }
    catch (error: any) {
      console.error('Error banning user:', error.message)
      // You might want to show an error toast/notification here
    }
    return
  }

  // Handle unban action
  if (action.type === 'unban') {
    try {
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
    }
    catch (error: any) {
      console.error('Error unbanning user:', error.message)
      // You might want to show an error toast/notification here
    }
    return
  }

  // Handle delete action
  if (action.type === 'delete') {
    try {
      const { error } = await supabase.functions.invoke('admin-user-delete', {
        method: 'POST',
        body: {
          userId: action.user.id,
        },
      })

      if (error)
        throw error

      // Trigger refresh after successful delete
      refreshSignal.value++
    }
    catch (error: any) {
      console.error('Error deleting user:', error.message)
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
function handleEditFromDetails(user: any) {
  userToEdit.value = user
  isEditMode.value = true
  showUserForm.value = true
  showUserDetails.value = false
}

// Handle save from UserForm
async function handleUserSave(userData: any) {
  try {
    const supabase = useSupabaseClient()

    if (!userToEdit.value)
      return

    // Extract role from userData (single role management)
    const { role, ...profileData } = userData

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
      if (currentUser.value && currentUser.value.id === userToEdit.value.id) {
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

    // Close the form and refresh data
    showUserForm.value = false
    refreshSignal.value++

    // User updated successfully
  }
  catch (error: any) {
    console.error('Error updating user:', error.message)
    // Handle error (you might want to show error message to user)
  }
}

// Handle delete from UserForm
async function handleUserDelete(userId: string) {
  try {
    const supabase = useSupabaseClient()

    // Note: You might want to implement soft delete or archive instead of hard delete
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId)

    if (error)
      throw error

    // Close form and refresh data
    showUserForm.value = false
    refreshSignal.value++

    // User deleted successfully
  }
  catch (error: any) {
    console.error('Error deleting user:', error.message)
  }
}
</script>

<template>
  <Flex column gap="l" expand>
    <!-- Page Header -->
    <Flex column :gap="0">
      <h1>Users</h1>
      <p class="color-text-light">
        Manage user accounts, permissions, and ban status
      </p>
    </Flex>

    <!-- KPIs Section -->
    <UserKPIs v-model:refresh-signal="refreshSignal" />

    <!-- Users Table -->
    <UserTable
      v-model:refresh-signal="refreshSignal"
      @user-selected="handleUserSelected"
      @action="handleUserAction"
      @update:refresh-signal="handleRefreshSignal"
    />
  </Flex>

  <!-- User Details Side Panel -->
  <UserDetails
    v-model:is-open="showUserDetails"
    v-model:user-action="userAction"
    v-model:refresh-user="userRefreshTrigger"
    :user="selectedUser"
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
</template>

<style lang="scss" scoped>

</style>
