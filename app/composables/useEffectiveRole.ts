import { computed } from 'vue'
import { useDataUser } from '@/composables/useDataUser'
import { useRoleImpersonation } from '@/composables/useRoleImpersonation'
import { useUserId } from '@/composables/useUserId'

export function useEffectiveRole() {
  const userId = useUserId()
  const { user: userData } = useDataUser(userId, { includeRole: true, includeAvatar: false })
  const realRole = computed(() => userData.value?.role ?? null)

  const { effectiveRole, isImpersonating, impersonatedRole } = useRoleImpersonation()

  const role = effectiveRole(realRole)
  const isAdminOrMod = computed(() => role.value === 'admin' || role.value === 'moderator')
  const isAdmin = computed(() => role.value === 'admin')
  const isModerator = computed(() => role.value === 'moderator')

  // role reads null both for a plain user and while the lookup is in flight.
  // This tells them apart: signed out, impersonating, or the user row has landed.
  const roleResolved = computed(() => !userId.value || isImpersonating.value || userData.value !== null)

  return { role, roleResolved, isAdminOrMod, isAdmin, isModerator, isImpersonating, impersonatedRole, realRole }
}
