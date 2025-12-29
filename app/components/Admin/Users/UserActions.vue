<script setup lang="ts">
import { Button, Flex } from '@dolanske/vui'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import { useBreakpoint } from '@/lib/mediaQuery'
import BanUserModal from './BanUserModal.vue'

const props = defineProps<{
  user: {
    id: string
    username: string
    supporter_patreon: boolean
    supporter_lifetime: boolean
    patreon_id: string | null
    banned: boolean
  }
  status: 'active' | 'banned'
  isLoading?: (action: string) => Record<string, boolean> | boolean
  showLabels?: boolean
  currentUserId?: string // Add current user ID to hide ban/delete for self
}>()

// Get admin permissions
const { canModifyUsers, canDeleteUsers } = useAdminPermissions()

const isMobile = useBreakpoint('<xs')
const showLabels = computed(() => !!props.showLabels && !isMobile.value)

// const buttonSize = computed(() => showLabels.value ? 'm' as const : 's' as const)

// Define a model value for actions with proper type
interface UserAction {
  user: typeof props.user
  type: 'ban' | 'unban' | 'edit' | 'delete' | null
  banDuration?: string
  banReason?: string
}
const action = defineModel<UserAction | null>('modelValue', { default: null })

// Handler functions to update the model value with the appropriate action
// State for modals
const showBanModal = ref(false)
const showUnbanConfirm = ref(false)
const showDeleteConfirm = ref(false)
const showEditConfirm = ref(false)

const isCurrentlyBanned = computed(() => props.status === 'banned')

function handleBan(banData: { duration: string, reason?: string }) {
  action.value = {
    user: props.user,
    type: 'ban',
    banDuration: banData.duration,
    banReason: banData.reason,
  }
  showBanModal.value = false
}

function handleUnban() {
  action.value = { user: props.user, type: 'unban' }
}

function handleDelete() {
  action.value = { user: props.user, type: 'delete' }
}

function handleEdit() {
  action.value = { user: props.user, type: 'edit' }
}

function openBanModal() {
  showBanModal.value = true
}

function openUnbanConfirm() {
  showUnbanConfirm.value = true
}

function openDeleteConfirm() {
  showDeleteConfirm.value = true
}

function openEditConfirm() {
  showEditConfirm.value = true
}

// Helper function to determine if specific action is loading
function isActionLoading(actionType: string): boolean {
  if (!props.isLoading)
    return false
  const loading = props.isLoading(actionType)
  if (typeof loading === 'boolean') {
    return loading
  }
  return !!loading[actionType]
}

// Check if this is the current user to prevent self-ban/delete
const isCurrentUser = computed(() => props.currentUserId === props.user.id)
</script>

<template>
  <Flex gap="xs">
    <Button
      v-if="canModifyUsers"
      size="s"
      variant="gray"
      :square="!showLabels"
      :data-title-top="!showLabels ? 'Edit User' : undefined"
      @click="openEditConfirm"
    >
      <template v-if="showLabels" #start>
        <Icon name="ph:pencil-simple" />
      </template>
      <Icon v-if="!showLabels" name="ph:pencil-simple" />
      <template v-if="showLabels">
        Edit
      </template>
    </Button>

    <Button
      v-if="!isCurrentlyBanned && canModifyUsers && !isCurrentUser"
      size="s"
      variant="danger"
      :loading="isActionLoading('ban')"
      :square="!showLabels"
      :data-title-top="!showLabels ? 'Ban User' : undefined"
      @click="openBanModal"
    >
      <template v-if="showLabels" #start>
        <Icon name="ph:prohibit" />
      </template>
      <Icon v-if="!showLabels" name="ph:prohibit" />
      <template v-if="showLabels">
        Ban
      </template>
    </Button>

    <Button
      v-if="isCurrentlyBanned && canModifyUsers && !isCurrentUser"
      size="s"
      variant="success"
      :loading="isActionLoading('unban')"
      :square="!showLabels"
      :data-title-top="!showLabels ? 'Unban User' : undefined"
      @click="openUnbanConfirm"
    >
      <template v-if="showLabels" #start>
        <Icon name="ph:check-circle" />
      </template>
      <Icon v-if="!showLabels" name="ph:check-circle" />
      <template v-if="showLabels">
        Unban
      </template>
    </Button>

    <Button
      v-if="canDeleteUsers && !isCurrentUser"
      size="s"
      variant="danger"
      :loading="isActionLoading('delete')"
      :square="!showLabels"
      :data-title-top="!showLabels ? 'Delete User' : undefined"
      @click="openDeleteConfirm"
    >
      <template v-if="showLabels" #start>
        <Icon name="ph:trash" />
      </template>
      <Icon v-if="!showLabels" name="ph:trash" />
      <template v-if="showLabels">
        Delete
      </template>
    </Button>

    <!-- Ban User Modal -->
    <BanUserModal
      v-model:open="showBanModal"
      :user="props.user"
      @ban="handleBan"
    />

    <!-- Confirmation Modal for Edit Action -->
    <ConfirmModal
      v-model:open="showEditConfirm"
      :confirm="handleEdit"
      title="Confirm Edit User"
      description="User information should only be modified for content moderation purposes."
      confirm-text="Proceed with Edit"
      cancel-text="Cancel"
      :destructive="true"
    />

    <!-- Confirmation Modal for Unban Action -->
    <ConfirmModal
      v-model:open="showUnbanConfirm"
      :confirm="handleUnban"
      title="Confirm Unban User"
      description="Are you sure you want to unban this user? They will regain access to the platform."
      confirm-text="Unban"
      cancel-text="Cancel"
      :destructive="false"
    />

    <!-- Confirmation Modal for Delete Action -->
    <ConfirmModal
      v-model:open="showDeleteConfirm"
      :confirm="handleDelete"
      title="Confirm Delete User"
      description="Are you sure you want to delete this user? This action cannot be undone and will permanently remove their account and data."
      confirm-text="Delete"
      cancel-text="Cancel"
      :destructive="true"
    />
  </Flex>
</template>
