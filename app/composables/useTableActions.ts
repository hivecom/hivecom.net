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
  catch {
    // If useAdminPermissions throws (not in admin context), return false for all permissions
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
