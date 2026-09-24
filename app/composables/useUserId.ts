// In Supabase Nuxt v2, useSupabaseUser() returns JWT claims rather than the full
// User object, so the ID lives in the `sub` claim.
export function useUserId() {
  const user = useSupabaseUser()

  return computed(() => {
    if (!user.value)
      return null

    // `id` is a fallback for compatibility.
    const sub = (user.value as Record<string, unknown>).sub
    const id = (user.value as Record<string, unknown>).id

    return (typeof sub === 'string' ? sub : null) ?? (typeof id === 'string' ? id : null)
  })
}
