import type { AppPermission, PermissionResource } from '@/types/database.overrides'
import { computed } from 'vue'
import { useAdminPermissions } from '@/composables/useAdminPermissions'

/**
 * Composable for determining if table actions should be shown
 * based on user permissions.
 *
 * `resourceType` is a permission group (the part before the dot in an
 * `app_permission`, e.g. 'network'), not an entity/table name. Typing it as
 * `PermissionResource` means a stale group like 'containers' fails to compile.
 */
export function useTableActions(resourceType: PermissionResource) {
  const { hasPermission } = useAdminPermissions()

  const canManageResource = computed(() => {
    return hasPermission(`${resourceType}.create` as AppPermission)
      || hasPermission(`${resourceType}.update` as AppPermission)
      || hasPermission(`${resourceType}.delete` as AppPermission)
  })

  const canCreate = computed(() => hasPermission(`${resourceType}.create` as AppPermission))
  const canUpdate = computed(() => hasPermission(`${resourceType}.update` as AppPermission))
  const canDelete = computed(() => hasPermission(`${resourceType}.delete` as AppPermission))

  return {
    canManageResource,
    canCreate,
    canUpdate,
    canDelete,
  }
}
