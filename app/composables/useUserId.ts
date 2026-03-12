/**
 * Helper composable to get the current user's ID from JWT claims.
 *
 * In Supabase Nuxt v2, useSupabaseUser() returns JWT claims, not the full User object.
 * The user ID is in the `sub` claim (standard JWT subject claim).
 *
 * @returns Computed ref with the current user's ID or null
 */
export function useUserId() {
  const user = useSupabaseUser()

  return computed(() => {
    if (!user.value)
      return null

    // In v2, user.value contains JWT claims. The user ID lives in `sub`
    // (standard JWT subject claim) with `id` as a fallback for compatibility.
    const sub = (user.value as Record<string, unknown>).sub
    const id = (user.value as Record<string, unknown>).id

    return (typeof sub === 'string' ? sub : null) ?? (typeof id === 'string' ? id : null)
  })
}
