<script setup lang="ts">
import type { AppPermission, PermissionResource } from '@/types/database.overrides'
import { Flex, Tooltip } from '@dolanske/vui'
import { computed, ref } from 'vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import ResponsiveButton from '@/components/Shared/ResponsiveButton.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

interface AdminActionsProps {
  /** Drives the display labels (modal titles, tooltips). */
  resourceType: 'games' | 'events' | 'network_gameservers' | 'profiles' | 'funding' | 'referendums' | 'network_servers' | 'assets' | 'projects' | 'discussions' | 'kvstore' | 'motds' | 'themes'

  /**
   * Permission group for the edit/delete checks. Defaults to `resourceType`. Set it
   * when the entity gates on another group, like network_gameservers on 'network'.
   */
  permission?: PermissionResource

  item: Record<string, unknown>

  isLoading?: (action: string) => Record<string, boolean> | boolean

  showLabels?: boolean

  buttonSize?: 's' | 'm' | 'l'

  /** Defaults to ['edit', 'delete']. */
  actions?: ('edit' | 'delete')[]

  customActions?: {
    icon: string
    label: string
    variant?: 'gray' | 'danger' | 'success' | 'accent'
    permission?: AppPermission
    handler: () => void
    loading?: boolean
    condition?: () => boolean
  }[]
}

const props = withDefaults(defineProps<AdminActionsProps>(), {
  showLabels: false,
  buttonSize: undefined,
  actions: () => ['edit', 'delete'],
  customActions: () => [],
})

const emit = defineEmits<{
  edit: [item: Record<string, unknown>]
  delete: [item: Record<string, unknown>]
}>()

const showDeleteConfirm = ref(false)

const { hasPermission } = useAdminPermissions()

const isMobile = useBreakpoint('<xs')
const showLabels = computed(() => !!props.showLabels && !isMobile.value)

const permissionResource = computed<PermissionResource>(
  () => props.permission ?? (props.resourceType as PermissionResource),
)

function hasActionPermission(action: string): boolean {
  return hasPermission(`${permissionResource.value}.${action}` as AppPermission)
}

function isActionLoading(actionType: string): boolean {
  if (!props.isLoading)
    return false

  const loading = props.isLoading(actionType)
  if (typeof loading === 'boolean') {
    return loading
  }
  return !!loading[actionType]
}

const showEditAction = computed(() =>
  props.actions.includes('edit') && hasActionPermission('update'),
)

const showDeleteAction = computed(() =>
  props.actions.includes('delete') && hasActionPermission('delete'),
)

const visibleCustomActions = computed(() =>
  props.customActions.filter((action) => {
    if (action.permission && !hasPermission(action.permission)) {
      return false
    }

    if (action.condition && !action.condition()) {
      return false
    }

    return true
  }),
)

const hasVisibleActions = computed(() =>
  showEditAction.value
  || showDeleteAction.value
  || visibleCustomActions.value.length > 0,
)

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

function getResourceDisplayName(): string {
  const resourceMap: Record<string, string> = {
    games: 'Game',
    events: 'Event',
    network_gameservers: 'Game Server',
    profiles: 'Profile',
    funding: 'Expense',
    referendums: 'Referendum',
    network_servers: 'Server',
    assets: 'Asset',
    discussions: 'Discussion',
    kvstore: 'Key/Value',
    motds: 'MOTD',
    themes: 'Theme',
  }

  return resourceMap[props.resourceType] || 'Item'
}

function getItemDisplayName(): string {
  if (!props.item)
    return 'this item'

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
    <Tooltip v-if="showEditAction" :disabled="showLabels">
      <ResponsiveButton
        :collapsed="!showLabels"
        :size="props.buttonSize"
        variant="gray"
        :loading="isActionLoading('edit')"
        icon="ph:pencil-simple"
        label="Edit"
        @click="handleEdit"
      />
      <template #tooltip>
        <p>Edit {{ resourceType.slice(0, -1) }}</p>
      </template>
    </Tooltip>

    <Tooltip
      v-for="(action, index) in visibleCustomActions"
      :key="index"
      :disabled="showLabels"
    >
      <ResponsiveButton
        :collapsed="!showLabels"
        :size="props.buttonSize"
        :variant="action.variant || 'gray'"
        :loading="action.loading"
        :icon="action.icon"
        :label="action.label"
        @click="action.handler"
      />
      <template #tooltip>
        <p>{{ action.label }}</p>
      </template>
    </Tooltip>

    <Tooltip v-if="showDeleteAction" :disabled="showLabels">
      <ResponsiveButton
        :collapsed="!showLabels"
        :size="props.buttonSize"
        variant="danger"
        :loading="isActionLoading('delete')"
        icon="ph:trash"
        label="Delete"
        @click="handleDelete"
      />
      <template #tooltip>
        <p>Delete {{ resourceType.slice(0, -1) }}</p>
      </template>
    </Tooltip>
  </Flex>

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
