import { computed } from 'vue'
import { useAdminPermissions } from '@/composables/useAdminPermissions'

/**
 * Composable for determining if table actions should be shown
 * based on user permissions
 */
export function useTableActions(resourceType: string) {
  const { hasPermission } = useAdminPermissions()

  const canManageResource = computed(() => {
    return Boolean(hasPermission(`${resourceType}.create`))
      || Boolean(hasPermission(`${resourceType}.update`))
      || Boolean(hasPermission(`${resourceType}.delete`))
  })

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
