/**
 * Returns the current user's ID from JWT claims. As opposed to `useUserId`
 * composable, the output is not reactive
 *
 * @returns
 */
export function useCurrentUserId(): string | null {
  const user = useSupabaseUser()
  return extractUserIdFromSupabaseUser(user.value)
}

// Helper which extractUserId
export function extractUserIdFromSupabaseUser(user: ReturnType<typeof useSupabaseUser>['value']): string | null {
  if (!user) {
    return null
  }

  // In v2, user.value contains JWT claims where the user ID is in `sub`
  // Type assertion for JWT claims structure
  const sub = user.sub
  const id = user.id

  // Return sub (standard JWT user ID claim) or fallback to id for compatibility
  return (typeof sub === 'string' ? sub : null) ?? (typeof id === 'string' ? id : null)
}
