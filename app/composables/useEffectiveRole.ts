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

  return { role, isAdminOrMod, isAdmin, isModerator, isImpersonating, impersonatedRole, realRole }
}
