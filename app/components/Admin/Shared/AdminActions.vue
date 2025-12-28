<script setup lang="ts">
import { Button, Flex } from '@dolanske/vui'
import { computed, ref } from 'vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

interface AdminActionsProps {
  /**
   * Type of resource (used for permission checking)
   */
  resourceType: 'games' | 'events' | 'gameservers' | 'profiles' | 'expenses' | 'announcements' | 'referendums' | 'servers' | 'assets' | 'projects' | 'kvstore' | 'motds'

  /**
   * The item being acted upon
   */
  item: Record<string, unknown>

  /**
   * Optional loading states for different actions
   */
  isLoading?: (action: string) => Record<string, boolean> | boolean

  /**
   * Whether to show action labels (default: false)
   */
  showLabels?: boolean

  /**
   * Override which actions to show (default: ['edit', 'delete'])
   */
  actions?: ('edit' | 'delete')[]

  /**
   * Custom action configurations
   */
  customActions?: {
    icon: string
    label: string
    variant?: 'gray' | 'danger' | 'success' | 'accent'
    permission?: string
    handler: () => void
    loading?: boolean
    condition?: () => boolean
  }[]
}

const props = withDefaults(defineProps<AdminActionsProps>(), {
  showLabels: false,
  actions: () => ['edit', 'delete'],
  customActions: () => [],
})

const emit = defineEmits<{
  edit: [item: Record<string, unknown>]
  delete: [item: Record<string, unknown>]
}>()

// State for delete confirmation modal
const showDeleteConfirm = ref(false)

// Get admin permissions
const { hasPermission } = useAdminPermissions()

const isMobile = useBreakpoint('<xs')
const showLabels = computed(() => !!props.showLabels && !isMobile.value)

// Helper function to check if user has permission for specific action
function hasActionPermission(action: string): boolean {
  const permission = `${props.resourceType}.${action}`
  return hasPermission(permission)
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

// Check if any actions should be shown
const showEditAction = computed(() =>
  props.actions.includes('edit') && hasActionPermission('update'),
)

const showDeleteAction = computed(() =>
  props.actions.includes('delete') && hasActionPermission('delete'),
)

// Filter custom actions based on permissions and conditions
const visibleCustomActions = computed(() =>
  props.customActions.filter((action) => {
    // Check permission if specified
    if (action.permission && !hasPermission(action.permission)) {
      return false
    }

    // Check condition if specified
    if (action.condition && !action.condition()) {
      return false
    }

    return true
  }),
)

// Check if we should show the actions container at all
const hasVisibleActions = computed(() =>
  showEditAction.value
  || showDeleteAction.value
  || visibleCustomActions.value.length > 0,
)

// Action handlers
function handleEdit() {
  emit('edit', props.item)
}

function handleDelete() {
  showDeleteConfirm.value = true
}

function confirmDelete() {
  emit('delete', props.item)
  showDeleteConfirm.value = false
}

// Helper function to get resource display name
function getResourceDisplayName(): string {
  const resourceMap: Record<string, string> = {
    games: 'Game',
    events: 'Event',
    gameservers: 'Game Server',
    profiles: 'Profile',
    expenses: 'Expense',
    announcements: 'Announcement',
    referendums: 'Referendum',
    servers: 'Server',
    assets: 'Asset',
    kvstore: 'Key/Value',
    motds: 'MOTD',
  }

  return resourceMap[props.resourceType] || 'Item'
}

// Helper function to get item display name
function getItemDisplayName(): string {
  if (!props.item)
    return 'this item'

  // Try common name properties
  if (props.item.title)
    return props.item.title as string
  if (props.item.name)
    return props.item.name as string
  if (props.item.username)
    return props.item.username as string

  return 'this item'
}
</script>

<template>
  <Flex v-if="hasVisibleActions" gap="xs">
    <!-- Edit Action -->
    <Button
      v-if="showEditAction"
      size="s"
      variant="gray"
      :square="!showLabels"
      :data-title-top="!showLabels ? `Edit ${resourceType.slice(0, -1)}` : undefined"
      :loading="isActionLoading('edit')"
      @click="handleEdit"
    >
      <template v-if="showLabels" #start>
        <Icon name="ph:pencil-simple" />
      </template>
      <Icon v-if="!showLabels" name="ph:pencil-simple" />
      <template v-if="showLabels">
        Edit
      </template>
    </Button>

    <!-- Custom Actions -->
    <Button
      v-for="(action, index) in visibleCustomActions"
      :key="index"
      size="s"
      :variant="action.variant || 'gray'"
      :square="!showLabels"
      :data-title-top-right="!showLabels ? action.label : undefined"
      :loading="action.loading"
      @click="action.handler"
    >
      <template v-if="showLabels" #start>
        <Icon :name="action.icon" />
      </template>
      <Icon v-if="!showLabels" :name="action.icon" />
      <template v-if="showLabels">
        {{ action.label }}
      </template>
    </Button>

    <!-- Delete Action -->
    <Button
      v-if="showDeleteAction"
      size="s"
      variant="danger"
      :square="!showLabels"
      :data-title-top-right="!showLabels ? `Delete ${resourceType.slice(0, -1)}` : undefined"
      :loading="isActionLoading('delete')"
      @click="handleDelete"
    >
      <template v-if="showLabels" #start>
        <Icon name="ph:trash" />
      </template>
      <Icon v-if="!showLabels" name="ph:trash" />
      <template v-if="showLabels">
        Delete
      </template>
    </Button>
  </Flex>

  <!-- Delete Confirmation Modal -->
  <ConfirmModal
    v-model:open="showDeleteConfirm"
    :confirm="confirmDelete"
    :title="`Confirm Delete ${getResourceDisplayName()}`"
    :description="`Are you sure you want to delete '${getItemDisplayName()}'? This action cannot be undone.`"
    confirm-text="Delete"
    cancel-text="Cancel"
    :destructive="true"
  />
</template>
