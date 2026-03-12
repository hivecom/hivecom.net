import { computed } from 'vue'
import { useAdminPermissions } from '@/composables/useAdminPermissions'

/**
 * Composable for determining if table actions should be shown
 * based on user permissions
 */
export function useTableActions(resourceType: string) {
  try {
    const { hasPermission } = useAdminPermissions()

    // Check if user has any management permissions for this resource
    const canManageResource = computed(() => {
      return Boolean(hasPermission(`${resourceType}.create`))
        || Boolean(hasPermission(`${resourceType}.update`))
        || Boolean(hasPermission(`${resourceType}.delete`))
    })

    // Check specific permissions
    const canCreate = computed(() => Boolean(hasPermission(`${resourceType}.create`)))
    const canUpdate = computed(() => Boolean(hasPermission(`${resourceType}.update`)))
    const canDelete = computed(() => Boolean(hasPermission(`${resourceType}.delete`)))

    return {
      canManageResource,
      canCreate,
      canUpdate,
      canDelete,
    }
  }
  catch (error) {
    // Only swallow errors that are expected when useAdminPermissions is called outside
    // the admin layout context (i.e. inject returns undefined). Re-throw anything else.
    const isContextError = error instanceof Error
      && (error.message.includes('admin') || error.message.includes('inject'))
    if (!isContextError) {
      throw error
    }

    const canManageResource = computed(() => false)
    const canCreate = computed(() => false)
    const canUpdate = computed(() => false)
    const canDelete = computed(() => false)

    return {
      canManageResource,
      canCreate,
      canUpdate,
      canDelete,
    }
  }
}
