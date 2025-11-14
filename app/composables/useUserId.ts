/**
 * Helper composable to get the current user's ID from JWT claims.
 *
 * In Supabase Nuxt v2, useSupabaseUser() returns JWT claims, not the full User object.
 * The user ID is in the `sub` claim (subject).
 *
 * @returns Computed ref with the current user's ID or null
 */
export function useUserId() {
  const user = useSupabaseUser()

  return computed(() => {
    if (!user.value)
      return null

    // In v2, user.value contains JWT claims where the user ID is in `sub`
    // Type assertion for JWT claims structure
    const claims = user.value as Record<string, unknown>
    const sub = claims.sub
    const id = claims.id

    // Return sub (standard JWT user ID claim) or fallback to id for compatibility
    return (typeof sub === 'string' ? sub : null) ?? (typeof id === 'string' ? id : null)
  })
}
