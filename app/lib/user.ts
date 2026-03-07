/**
 * Returns the current user's ID from JWT claims. As opposed to `useUserId`
 * composable, the output is not reactive. This is useful for places where you
 * just need the user ID once, such as in API calls or non-reactive contexts.
 *
 * @returns The current user's ID or null
 */
export function useCurrentUserId(): string | null {
  const user = useSupabaseUser()
  return extractSupabaseUserId(user.value)
}

// Helper which extracts the user ID from a Supabase user object
export function extractSupabaseUserId(user: ReturnType<typeof useSupabaseUser>['value']): string | null {
  if (!user) {
    return null
  }

  // In v2, user.value contains JWT claims where the user ID is in `sub`
  // Type assertion for JWT claims structure
  const sub = user.sub
  const id = user.id as never

  // Return sub (standard JWT user ID claim) or fallback to id for compatibility
  return (typeof sub === 'string' ? sub : null) ?? (typeof id === 'string' ? id : null)
}
