/**
 * Composable for accessing user permissions in admin pages.
 * Intended for use within the admin layout context, but returns safe all-false
 * defaults when called outside it (e.g. during a layout transition or from a
 * component that renders briefly before the admin layout's provide() is in scope).
 */
import type { Ref } from 'vue'
import type { AppPermission } from '@/types/database.overrides'
import { computed, inject, ref } from 'vue'

const _falsePermissions = ref<string[]>([])
const _nullRole = ref<string | null>(null)
const _noop = (_: AppPermission) => false
const _noopAny = (_: AppPermission[]) => false

export function useAdminPermissions() {
  // Inject the permissions provided by the admin layout. Pass defaults so Vue
  // does not emit injection-not-found warnings when this composable is used
  // outside the admin layout (e.g. during a layout transition).
  const userPermissions = inject<Readonly<Ref<string[]>>>('userPermissions', _falsePermissions)
  const userRole = inject<Readonly<Ref<string | null>>>('userRole', _nullRole)
  const hasPermission = inject<(permission: AppPermission) => boolean>('hasPermission', _noop)
  const hasAnyPermission = inject<(permissions: AppPermission[]) => boolean>('hasAnyPermission', _noopAny)

  const resolvedPermissions = userPermissions
  const resolvedRole = userRole
  const resolvedHasPermission = hasPermission
  const resolvedHasAnyPermission = hasAnyPermission

  return {
    userPermissions: resolvedPermissions,
    userRole: resolvedRole,
    hasPermission: resolvedHasPermission,
    hasAnyPermission: resolvedHasAnyPermission,

    // Convenience helpers for common permission checks
    canManageUsers: computed(() => resolvedHasAnyPermission(['users.create', 'users.update', 'users.delete'])),
    canViewUsers: computed(() => resolvedHasPermission('users.read')),
    canModifyUsers: computed(() => resolvedHasPermission('users.update')),
    canDeleteUsers: computed(() => resolvedHasPermission('users.delete')),
    canManageEvents: computed(() => resolvedHasAnyPermission(['events.create', 'events.update', 'events.delete'])),
    canViewEvents: computed(() => resolvedHasPermission('events.read')),
    canManageGames: computed(() => resolvedHasAnyPermission(['games.create', 'games.update', 'games.delete'])),
    canViewGames: computed(() => resolvedHasPermission('games.read')),
    canManageNetwork: computed(() => resolvedHasAnyPermission(['network.create', 'network.update', 'network.delete'])),
    canViewNetwork: computed(() => resolvedHasPermission('network.read')),
    canManageFunding: computed(() => resolvedHasAnyPermission(['funding.create', 'funding.update', 'funding.delete'])),
    canViewFunding: computed(() => resolvedHasPermission('funding.read')),
    canManageReferendums: computed(() => resolvedHasAnyPermission(['referendums.create', 'referendums.update', 'referendums.delete'])),
    canViewReferendums: computed(() => resolvedHasPermission('referendums.read')),
    canManageRoles: computed(() => resolvedHasAnyPermission(['roles.create', 'roles.update', 'roles.delete'])),
    canViewRoles: computed(() => resolvedHasPermission('roles.read')),
    canCreateRoles: computed(() => resolvedHasPermission('roles.create')),
    canUpdateRoles: computed(() => resolvedHasPermission('roles.update')),
    canDeleteRoles: computed(() => resolvedHasPermission('roles.delete')),
    canManageComplaints: computed(() => resolvedHasAnyPermission(['complaints.create', 'complaints.update', 'complaints.delete'])),
    canViewComplaints: computed(() => resolvedHasPermission('complaints.read')),
    canCreateComplaints: computed(() => resolvedHasPermission('complaints.create')),
    canUpdateComplaints: computed(() => resolvedHasPermission('complaints.update')),
    canDeleteComplaints: computed(() => resolvedHasPermission('complaints.delete')),
    canManageAssets: computed(() => resolvedHasAnyPermission(['assets.create', 'assets.update', 'assets.delete'])),
    canViewAssets: computed(() => resolvedHasPermission('assets.read')),
    canCreateAssets: computed(() => resolvedHasPermission('assets.create')),
    canUpdateAssets: computed(() => resolvedHasPermission('assets.update')),
    canDeleteAssets: computed(() => resolvedHasPermission('assets.delete')),

    // Check if user is an admin (highest privilege level)
    isAdmin: computed(() => resolvedRole.value === 'admin'),
    isModerator: computed(() => resolvedRole.value === 'moderator'),
  }
}
