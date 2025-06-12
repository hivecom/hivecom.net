import { computed } from 'vue'

/**
 * Composable for determining if table actions should be shown
 * based on user permissions
 */
export function useTableActions(resourceType: string) {
  const { hasPermission } = useAdminPermissions()

  // Check if user has any management permissions for this resource
  const canManageResource = computed(() => {
    return hasPermission(`${resourceType}.create`)
      || hasPermission(`${resourceType}.update`)
      || hasPermission(`${resourceType}.delete`)
  })

  // Check specific permissions
  const canCreate = computed(() => hasPermission(`${resourceType}.create`))
  const canUpdate = computed(() => hasPermission(`${resourceType}.update`))
  const canDelete = computed(() => hasPermission(`${resourceType}.delete`))

  return {
    canManageResource,
    canCreate,
    canUpdate,
    canDelete,
  }
}
