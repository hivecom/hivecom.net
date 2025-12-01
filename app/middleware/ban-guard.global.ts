import type { Database } from '@/types/database.types'

interface BanState {
  checked: boolean
  active: boolean
  message: string | null
}

export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server)
    return

  const user = useSupabaseUser()
  if (!user.value)
    return

  const userId = typeof user.value?.id === 'string' ? user.value.id : null
  if (userId === null)
    return

  const banState = useState<BanState>('current-user-ban-status', () => ({
    checked: false,
    active: false,
    message: null,
  }))

  // Avoid repeated lookups once we've already checked in this session
  if (!banState.value.checked) {
    const supabase = useSupabaseClient<Database>()
    const { data, error } = await supabase
      .from('profiles')
      .select('banned, ban_end, ban_reason')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.error('Failed to check ban status', error)
      banState.value.checked = true
      return
    }

    const banEndDate = typeof data?.ban_end === 'string' ? new Date(data.ban_end) : null
    const banStillActive = banEndDate === null || banEndDate.getTime() > Date.now()
    const isBanActive = data?.banned === true && banStillActive
    const banReason = typeof data?.ban_reason === 'string' && data.ban_reason.trim().length > 0
      ? data.ban_reason
      : null

    banState.value = {
      checked: true,
      active: isBanActive,
      message: isBanActive
        ? (banReason !== null
            ? `Account suspended: ${banReason}`
            : 'Account suspended. Please contact support.')
        : null,
    }
  }

  if (!banState.value.active)
    return

  const supabase = useSupabaseClient<Database>()
  await supabase.auth.signOut()

  const query: Record<string, string> = { banned: '1' }
  if (typeof banState.value.message === 'string' && banState.value.message.length > 0)
    query.message = banState.value.message

  return navigateTo({ path: '/auth/sign-in', query }, { replace: true })
})
