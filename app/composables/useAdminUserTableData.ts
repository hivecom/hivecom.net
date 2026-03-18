import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'

// Type for user profile from query - only includes fields we actually select
export type QueryUserProfile = Pick<Tables<'profiles'>, | 'id'
  | 'username'
  | 'country'
  | 'birthday'
  | 'created_at'
  | 'modified_at'
  | 'modified_by'
  | 'supporter_lifetime'
  | 'supporter_patreon'
  | 'badges'
  | 'patreon_id'
  | 'steam_id'
  | 'discord_id'
  | 'introduction'
  | 'markdown'
  | 'banned'
  | 'ban_reason'
  | 'ban_start'
  | 'ban_end'
  | 'last_seen'
  | 'website'
  | 'public'>

export type AdminUserProfile = QueryUserProfile & {
  email: string | null
  role?: string | null
  confirmed?: boolean
  discord_display_name?: string | null
  auth_provider?: string | null
  auth_providers?: string[] | null
}

interface AdminUserOverviewRecord {
  user_id: string
  email: string | null
  is_confirmed: boolean
  discord_display_name: string | null
  auth_provider: string | null
  auth_providers: string[] | null
}

export function useAdminUserTableData(canViewUserEmails: { value: boolean }) {
  const supabase = useSupabaseClient<Database>()

  const loading = ref(true)
  const errorMessage = ref('')
  const users = ref<QueryUserProfile[]>([])
  const userRoles = ref<Record<string, string | null>>({})
  const userEmails = ref<Record<string, string | null>>({})
  const userConfirmed = ref<Record<string, boolean>>({})
  const userDiscordDisplayName = ref<Record<string, string | null>>({})
  const userAuthProvider = ref<Record<string, string | null>>({})
  const userAuthProviders = ref<Record<string, string[] | null>>({})

  async function fetchUsers() {
    loading.value = true
    errorMessage.value = ''

    try {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select(`
          id,
          username,
          country,
          birthday,
          created_at,
          modified_at,
          modified_by,
          supporter_lifetime,
          supporter_patreon,
          badges,
          patreon_id,
          steam_id,
          discord_id,
          introduction,
          markdown,
          banned,
          ban_reason,
          ban_start,
          ban_end,
          last_seen,
          website,
          public
        `)
        .order('created_at', { ascending: false })

      if (profilesError)
        throw profilesError

      users.value = profilesData ?? []

      // Roles - soft failure so the table still renders without them
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role')

      if (rolesError) {
        console.warn('Could not fetch user roles:', rolesError)
      }
      else {
        const rolesMap: Record<string, string | null> = {}
        rolesData?.forEach(r => (rolesMap[r.user_id] = r.role))
        userRoles.value = rolesMap
      }

      const { data: overviewData, error: overviewError } = await supabase.rpc('get_admin_user_overview')

      if (overviewError)
        throw overviewError

      const emailsMap: Record<string, string | null> = {}
      const confirmedMap: Record<string, boolean> = {}
      const discordNameMap: Record<string, string | null> = {}
      const providerMap: Record<string, string | null> = {}
      const providersMap: Record<string, string[] | null> = {}

      const rows = (overviewData ?? []) as AdminUserOverviewRecord[]
      rows.forEach(({ user_id, email, is_confirmed, discord_display_name, auth_provider, auth_providers }) => {
        emailsMap[user_id] = canViewUserEmails.value ? email : null
        confirmedMap[user_id] = Boolean(is_confirmed)
        discordNameMap[user_id] = discord_display_name
        providerMap[user_id] = auth_provider
        providersMap[user_id] = auth_providers
      })

      userEmails.value = emailsMap
      userConfirmed.value = confirmedMap
      userDiscordDisplayName.value = discordNameMap
      userAuthProvider.value = providerMap
      userAuthProviders.value = providersMap
    }
    catch (error: unknown) {
      console.error('Error fetching users:', error)
      errorMessage.value = (error as Error).message || 'An error occurred while loading users'
    }
    finally {
      loading.value = false
    }
  }

  // Lookup helpers - kept here so filteredData in the component can call them without
  // drilling through additional props.
  function getUserEmail(userId: string): string | null {
    return userEmails.value[userId] ?? null
  }

  function getUserConfirmedState(userId: string): boolean {
    return userConfirmed.value[userId] ?? false
  }

  function getUserDiscordDisplayName(userId: string): string | null {
    return userDiscordDisplayName.value[userId] ?? null
  }

  function getUserAuthProvider(userId: string): string | null {
    return userAuthProvider.value[userId] ?? null
  }

  function getUserAuthProviders(userId: string): string[] | null {
    return userAuthProviders.value[userId] ?? null
  }

  function getUserRole(userId: string): string | null {
    return userRoles.value[userId] ?? null
  }

  function buildAdminProfile(user: QueryUserProfile): AdminUserProfile {
    return {
      id: user.id,
      username: user.username ?? 'Unknown',
      country: user.country,
      birthday: user.birthday,
      created_at: user.created_at,
      modified_at: user.modified_at,
      modified_by: user.modified_by,
      supporter_patreon: user.supporter_patreon ?? false,
      supporter_lifetime: user.supporter_lifetime ?? false,
      badges: user.badges ?? [],
      patreon_id: user.patreon_id,
      steam_id: user.steam_id,
      discord_id: user.discord_id,
      introduction: user.introduction,
      markdown: user.markdown,
      banned: user.banned ?? false,
      ban_reason: user.ban_reason,
      ban_start: user.ban_start,
      ban_end: user.ban_end,
      last_seen: user.last_seen,
      website: user.website ?? null,
      public: user.public,
      role: getUserRole(user.id),
      email: getUserEmail(user.id),
      confirmed: getUserConfirmedState(user.id),
      discord_display_name: getUserDiscordDisplayName(user.id),
      auth_provider: getUserAuthProvider(user.id),
      auth_providers: getUserAuthProviders(user.id),
    }
  }

  return {
    loading,
    errorMessage,
    users,
    userRoles,
    fetchUsers,
    getUserEmail,
    getUserConfirmedState,
    getUserDiscordDisplayName,
    getUserAuthProvider,
    getUserAuthProviders,
    getUserRole,
    buildAdminProfile,
  }
}
