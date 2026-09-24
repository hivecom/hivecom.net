/**
 * Permissions for the current user's effective role, usable on any page.
 *
 * Staff roles read their grants from role_permissions, fetched once per role and
 * shared by every caller. Signed-in users without a staff role get the hardcoded
 * baseline. Impersonation flows through useEffectiveRole, so the list swaps with
 * it the same way the admin layout's did.
 */
import type { AppPermission } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { computed, ref, watch } from 'vue'
import { useEffectiveRole } from '@/composables/useEffectiveRole'
import { DEFAULT_USER_PERMISSIONS } from '@/lib/rolePermissions'

type StaffRole = 'admin' | 'moderator'

// Module-scoped so one fetch per role serves the whole session
const _staffPermissions = ref<Partial<Record<StaffRole, string[]>>>({})
const _inflight = new Map<StaffRole, Promise<void>>()

function isStaffRole(role: string | null): role is StaffRole {
  return role === 'admin' || role === 'moderator'
}

export function usePermissions() {
  const supabase = useSupabaseClient<Database>()
  const userId = useUserId()
  const { role, roleResolved } = useEffectiveRole()

  function load(staffRole: StaffRole) {
    if (_staffPermissions.value[staffRole] || _inflight.has(staffRole))
      return

    const request = (async () => {
      const { data, error } = await supabase
        .from('role_permissions')
        .select('permission')
        .eq('role', staffRole)

      // A failed fetch resolves to no permissions, so the UI fails closed
      if (error)
        console.error('usePermissions: failed to fetch role permissions', error)

      _staffPermissions.value = {
        ..._staffPermissions.value,
        [staffRole]: data?.map(p => p.permission) ?? [],
      }
    })().finally(() => _inflight.delete(staffRole))

    _inflight.set(staffRole, request)
  }

  // role_permissions is the same for every user, but keep the fetch client-side
  // so module state never gets populated during SSR
  if (import.meta.client) {
    watch(role, (current) => {
      if (isStaffRole(current))
        load(current)
    }, { immediate: true })
  }

  const permissions = computed<string[]>(() => {
    const current = role.value

    if (isStaffRole(current))
      return _staffPermissions.value[current] ?? []

    // 'user' only shows up here while impersonating. A real user has a null role.
    if (current === 'user' || userId.value)
      return DEFAULT_USER_PERMISSIONS

    return []
  })

  // False until the role is known and, for staff, its grants have loaded. A
  // null role mid-lookup would otherwise pass as a plain user.
  const ready = computed(() => {
    if (!roleResolved.value)
      return false

    const current = role.value
    return !isStaffRole(current) || !!_staffPermissions.value[current]
  })

  function hasPermission(permission: AppPermission): boolean {
    return permissions.value.includes(permission)
  }

  function hasAnyPermission(list: AppPermission[]): boolean {
    return list.some(permission => permissions.value.includes(permission))
  }

  return { permissions, ready, hasPermission, hasAnyPermission }
}
