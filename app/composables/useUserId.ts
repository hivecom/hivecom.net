import { extractUserIdFromSupabaseUser } from '@/lib/user'

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
  return computed(() => extractUserIdFromSupabaseUser(user.value))
}
