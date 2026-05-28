import type { Component, ComputedRef, Ref } from 'vue'
import type { Database } from '@/types/database.types'
import { pushToast, removeToast } from '@dolanske/vui'
import { DEFAULT_USER_PERMISSIONS } from '@/lib/rolePermissions'

export type ImpersonatableRole = 'moderator' | 'user'

type PersistToast = ReturnType<typeof pushToast>

// Module-level so state and toast persist across navigations within the admin layout
const _impersonatedRole = ref<ImpersonatableRole | null>(null)
let _activeToast: PersistToast | null = null

export function useRoleImpersonation() {
  const impersonatedRole = _impersonatedRole
  const isImpersonating = computed(() => impersonatedRole.value !== null)

  function stop() {
    _impersonatedRole.value = null
    if (_activeToast !== null) {
      removeToast(_activeToast.id)
      _activeToast = null
    }
  }

  function start(role: ImpersonatableRole) {
    _impersonatedRole.value = role

    if (_activeToast !== null)
      removeToast(_activeToast.id)

    void import('@/components/Toast/ToastBodyImpersonate.vue').then(({ default: ToastBody }) => {
      void (() => {
        _activeToast = pushToast('', {
          persist: true,
          body: markRaw(ToastBody as Component),
          bodyProps: {
            role,
            onStop: (toastId: number) => {
              stop()
              removeToast(toastId)
              _activeToast = null
            },
          },
        })
      })()
    })
  }

  /**
   * Resolves the permissions for the given impersonated role.
   * For 'user' returns the hardcoded baseline; for 'moderator' fetches from DB.
   */
  async function resolvePermissions(role: ImpersonatableRole): Promise<string[]> {
    if (role === 'user') {
      return [...DEFAULT_USER_PERMISSIONS]
    }

    const supabase = useSupabaseClient<Database>()
    const { data, error } = await supabase
      .from('role_permissions')
      .select('permission')
      .eq('role', role)

    if (error) {
      console.error('useRoleImpersonation: failed to fetch permissions', error)
      return []
    }

    return data?.map((p: { permission: string }) => p.permission) ?? []
  }

  function effectiveRole(realRole: Ref<string | null> | ComputedRef<string | null>): ComputedRef<string | null> {
    return computed(() => isImpersonating.value ? impersonatedRole.value : realRole.value)
  }

  return {
    impersonatedRole,
    isImpersonating,
    start,
    stop,
    resolvePermissions,
    effectiveRole,
  }
}
