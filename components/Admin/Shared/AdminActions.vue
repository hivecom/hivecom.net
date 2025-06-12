<script setup lang="ts">
import { Button, Flex } from '@dolanske/vui'

interface AdminActionsProps {
  /**
   * Type of resource (used for permission checking)
   */
  resourceType: 'games' | 'events' | 'gameservers' | 'profiles' | 'expenses' | 'announcements' | 'referendums' | 'servers'

  /**
   * The item being acted upon
   */
  item: any

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
  edit: [item: any]
  delete: [item: any]
}>()

// Get admin permissions
const { hasPermission } = useAdminPermissions()

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

// Computed properties for button styling
const buttonSize = computed(() => props.showLabels ? 'm' as const : 's' as const)
const showLabels = computed(() => !!props.showLabels)

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
  emit('delete', props.item)
}
</script>

<template>
  <Flex v-if="hasVisibleActions" :gap="props.showLabels ? 's' : 'xs'">
    <!-- Edit Action -->
    <Button
      v-if="showEditAction"
      :size="buttonSize"
      variant="gray"
      :icon="props.showLabels ? undefined : 'ph:pencil-simple'"
      :square="!showLabels"
      :data-title-top="!showLabels ? `Edit ${resourceType.slice(0, -1)}` : undefined"
      :loading="isActionLoading('edit')"
      @click="handleEdit"
    >
      <template v-if="props.showLabels" #start>
        <Icon name="ph:pencil-simple" />
      </template>
      <template v-if="showLabels">
        Edit
      </template>
    </Button>

    <!-- Custom Actions -->
    <Button
      v-for="(action, index) in visibleCustomActions"
      :key="index"
      :size="buttonSize"
      :variant="action.variant || 'gray'"
      :icon="props.showLabels ? undefined : action.icon"
      :square="!showLabels"
      :data-title-top="!showLabels ? action.label : undefined"
      :loading="action.loading"
      @click="action.handler"
    >
      <template v-if="props.showLabels" #start>
        <Icon :name="action.icon" />
      </template>
      <template v-if="showLabels">
        {{ action.label }}
      </template>
    </Button>

    <!-- Delete Action -->
    <Button
      v-if="showDeleteAction"
      :size="buttonSize"
      variant="danger"
      :icon="props.showLabels ? undefined : 'ph:trash'"
      :square="!showLabels"
      :data-title-top="!showLabels ? `Delete ${resourceType.slice(0, -1)}` : undefined"
      :loading="isActionLoading('delete')"
      @click="handleDelete"
    >
      <template v-if="props.showLabels" #start>
        <Icon name="ph:trash" />
      </template>
      <template v-if="showLabels">
        Delete
      </template>
    </Button>
  </Flex>
</template>
