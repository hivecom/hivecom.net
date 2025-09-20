/**
 * Composable for accessing user permissions in admin pages
 * This should only be used within the admin layout context
 */
import type { Ref } from 'vue'
import { computed, inject } from 'vue'

export function useAdminPermissions() {
  // Inject the permissions provided by the admin layout
  const userPermissions = inject<Readonly<Ref<string[]>>>('userPermissions')
  const userRole = inject<Readonly<Ref<string | null>>>('userRole')
  const hasPermission = inject<(permission: string) => boolean>('hasPermission')
  const hasAnyPermission = inject<(permissions: string[]) => boolean>('hasAnyPermission')

  if (!userPermissions || !userRole || !hasPermission || !hasAnyPermission) {
    throw new Error('useAdminPermissions must be used within an admin layout that provides permissions')
  }

  return {
    userPermissions,
    userRole,
    hasPermission,
    hasAnyPermission,

    // Convenience helpers for common permission checks
    canManageUsers: computed(() => hasAnyPermission(['users.create', 'users.update', 'users.delete'])),
    canViewUsers: computed(() => hasPermission('users.read')),
    canModifyUsers: computed(() => hasPermission('users.update')),
    canDeleteUsers: computed(() => hasPermission('users.delete')),
    canManageEvents: computed(() => hasAnyPermission(['events.create', 'events.update', 'events.delete'])),
    canViewEvents: computed(() => hasPermission('events.read')),
    canManageGames: computed(() => hasAnyPermission(['games.create', 'games.update', 'games.delete'])),
    canViewGames: computed(() => hasPermission('games.read')),
    canManageGameServers: computed(() => hasAnyPermission(['gameservers.create', 'gameservers.update', 'gameservers.delete'])),
    canViewGameServers: computed(() => hasPermission('gameservers.read')),
    canManageFunding: computed(() => hasAnyPermission(['funding.create', 'funding.update', 'funding.delete', 'expenses.create', 'expenses.update', 'expenses.delete'])),
    canViewFunding: computed(() => hasAnyPermission(['funding.read', 'expenses.read'])),
    canManageReferendums: computed(() => hasAnyPermission(['referendums.create', 'referendums.update', 'referendums.delete'])),
    canViewReferendums: computed(() => hasPermission('referendums.read')),
    canManageRoles: computed(() => hasAnyPermission(['roles.create', 'roles.update', 'roles.delete'])),
    canViewRoles: computed(() => hasPermission('roles.read')),
    canCreateRoles: computed(() => hasPermission('roles.create')),
    canUpdateRoles: computed(() => hasPermission('roles.update')),
    canDeleteRoles: computed(() => hasPermission('roles.delete')),
    canManageComplaints: computed(() => hasAnyPermission(['complaints.create', 'complaints.update', 'complaints.delete'])),
    canViewComplaints: computed(() => hasPermission('complaints.read')),
    canCreateComplaints: computed(() => hasPermission('complaints.create')),
    canUpdateComplaints: computed(() => hasPermission('complaints.update')),
    canDeleteComplaints: computed(() => hasPermission('complaints.delete')),

    // Check if user is an admin (highest privilege level)
    isAdmin: computed(() => userRole.value === 'admin'),
    isModerator: computed(() => userRole.value === 'moderator'),
  }
}
