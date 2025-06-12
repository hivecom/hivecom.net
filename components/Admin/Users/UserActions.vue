<script setup lang="ts">
import { Button, Flex } from '@dolanske/vui'
import ConfirmModal from '../../Shared/ConfirmModal.vue'
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
  status: string
  isLoading?: (action: string) => Record<string, boolean> | boolean
  showLabels?: boolean
}>()

// Get admin permissions
const { canModifyUsers, canDeleteUsers } = useAdminPermissions()

// Define a model value for actions with proper type
type UserAction = {
  user: any
  type: 'ban' | 'unban' | 'edit' | 'delete' | null
  banDuration?: string
} | null
const action = defineModel<UserAction>('modelValue', { default: null })

// Handler functions to update the model value with the appropriate action
// State for modals
const showBanModal = ref(false)
const showUnbanConfirm = ref(false)
const showDeleteConfirm = ref(false)
const showEditConfirm = ref(false)

function handleBan(banDuration: string) {
  action.value = { user: props.user, type: 'ban', banDuration }
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

// Computed properties for button styling based on variant
const buttonSize = computed(() => props.showLabels ? 'm' as const : 's' as const)
const showLabels = computed(() => !!props.showLabels)
</script>

<template>
  <Flex :gap="props.showLabels ? 's' : 'xs'">
    <Button
      v-if="canModifyUsers"
      :size="buttonSize"
      variant="gray"
      :icon="props.showLabels ? undefined : 'ph:pencil-simple'"
      :square="!showLabels"
      :data-title-top="!showLabels ? 'Edit User' : undefined"
      @click="openEditConfirm"
    >
      <template v-if="props.showLabels" #start>
        <Icon name="ph:pencil-simple" />
      </template>
      <template v-if="showLabels">
        Edit
      </template>
    </Button>

    <Button
      v-if="!props.user.banned && canModifyUsers"
      :size="buttonSize"
      variant="danger"
      :loading="isActionLoading('ban')"
      :icon="props.showLabels ? undefined : 'ph:prohibit'"
      :square="!showLabels"
      :data-title-top="!showLabels ? 'Ban User' : undefined"
      @click="openBanModal"
    >
      <template v-if="props.showLabels" #start>
        <Icon name="ph:prohibit" />
      </template>
      <template v-if="showLabels">
        Ban
      </template>
    </Button>

    <Button
      v-if="props.user.banned && canModifyUsers"
      :size="buttonSize"
      variant="success"
      :loading="isActionLoading('unban')"
      :icon="props.showLabels ? undefined : 'ph:check-circle'"
      :square="!showLabels"
      :data-title-top="!showLabels ? 'Unban User' : undefined"
      @click="openUnbanConfirm"
    >
      <template v-if="props.showLabels" #start>
        <Icon name="ph:check-circle" />
      </template>
      <template v-if="showLabels">
        Unban
      </template>
    </Button>

    <Button
      v-if="canDeleteUsers"
      :size="buttonSize"
      variant="danger"
      :loading="isActionLoading('delete')"
      :icon="props.showLabels ? undefined : 'ph:trash'"
      :square="!showLabels"
      :data-title-top="!showLabels ? 'Delete User' : undefined"
      @click="openDeleteConfirm"
    >
      <template v-if="props.showLabels" #start>
        <Icon name="ph:trash" />
      </template>
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
      v-model:confirm="handleEdit"
      title="Confirm Edit User"
      description="User information should only be modified for content moderation purposes."
      confirm-text="Proceed with Edit"
      cancel-text="Cancel"
      :destructive="true"
    />

    <!-- Confirmation Modal for Unban Action -->
    <ConfirmModal
      v-model:open="showUnbanConfirm"
      v-model:confirm="handleUnban"
      title="Confirm Unban User"
      description="Are you sure you want to unban this user? They will regain access to the platform."
      confirm-text="Unban"
      cancel-text="Cancel"
      :destructive="false"
    />

    <!-- Confirmation Modal for Delete Action -->
    <ConfirmModal
      v-model:open="showDeleteConfirm"
      v-model:confirm="handleDelete"
      title="Confirm Delete User"
      description="Are you sure you want to delete this user? This action cannot be undone and will permanently remove their account and data."
      confirm-text="Delete"
      cancel-text="Cancel"
      :destructive="true"
    />
  </Flex>
</template>
