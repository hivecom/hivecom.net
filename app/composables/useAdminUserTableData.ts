import type { Ref } from 'vue'
import type { Database } from '@/types/database.types'
import { ref } from 'vue'
import { COUNTRY_SELECT_OPTIONS } from '@/lib/utils/country'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminUserRecord {
  id: string
  username: string | null
  country: string | null
  birthday: string | null
  created_at: string
  modified_at: string | null
  modified_by: string | null
  supporter_lifetime: boolean
  supporter_patreon: boolean
  patreon_id: string | null
  steam_id: string | null
  discord_id: string | null
  lastfm_username: string | null
  introduction: string | null
  markdown: string | null
  banned: boolean
  ban_reason: string | null
  ban_start: string | null
  ban_end: string | null
  last_seen: string
  website: string | null
  public: boolean
  rich_presence_enabled: boolean
  has_teamspeak: boolean
  // joined fields
  role: string | null
  email: string | null
  is_confirmed: boolean
  discord_display_name: string | null
  auth_provider: string | null
  auth_providers: string[]
  platform_count: number
  is_supporter: boolean
  is_banned: boolean
  role_sort: number
  total_count: number
}

export type AdminUserSortCol = 'username' | 'created_at' | 'last_seen' | 'role' | 'status' | 'platforms' | 'supporter' | 'confirmed'
export type SortDir = 'asc' | 'desc'

export interface AdminUserProfile {
  id: string
  username: string
  country: string | null
  birthday: string | null
  created_at: string
  modified_at: string | null
  modified_by: string | null
  supporter_lifetime: boolean
  supporter_patreon: boolean
  patreon_id: string | null
  steam_id: string | null
  discord_id: string | null
  lastfm_username: string | null
  introduction: string | null
  markdown: string | null
  banned: boolean
  ban_reason: string | null
  ban_start: string | null
  ban_end: string | null
  last_seen: string
  website: string | null
  public: boolean
  rich_presence_enabled: boolean
  has_teamspeak: boolean
  email: string | null
  role?: string | null
  confirmed?: boolean
  discord_display_name?: string | null
  auth_provider?: string | null
  auth_providers?: string[] | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Composable
// ─────────────────────────────────────────────────────────────────────────────

interface UseAdminUserTableDataParams {
  perPage: Ref<number>
}

export function useAdminUserTableData({ perPage }: UseAdminUserTableDataParams) {
  const supabase = useSupabaseClient<Database>()

  const loading = ref(false)
  const initialLoad = ref(true)
  const errorMessage = ref('')
  const users = ref<AdminUserRecord[]>([])
  const totalCount = ref(0)
  const inflight = ref(false)

  const page = ref(1)
  const sortCol = ref<AdminUserSortCol>('created_at')
  const sortDir = ref<SortDir>('desc')
  const search = ref('')
  const roleFilter = ref('')
  const statusFilter = ref('')
  const providerFilter = ref('')
  const platformFilter = ref('')
  const supporterFilter = ref('')
  const countryFilter = ref('')
  const availableCountries = ref<Array<{ label: string, value: string }>>([])

  // ─── Fetch ───────────────────────────────────────────────────────────────

  async function fetchCountries(): Promise<void> {
    const { data } = await supabase.rpc('get_admin_user_countries' as never)
    if (data != null) {
      const codes = new Set((data as unknown as Array<{ country: string }>).map(r => r.country))
      availableCountries.value = COUNTRY_SELECT_OPTIONS.filter(o => codes.has(o.value))
    }
  }

  async function fetchUsers(): Promise<void> {
    if (inflight.value)
      return
    inflight.value = true
    loading.value = true
    errorMessage.value = ''

    try {
      const { data, error } = await supabase.rpc('get_admin_users_paginated', {
        p_search: search.value,
        p_role: roleFilter.value,
        p_status: statusFilter.value,
        p_provider: providerFilter.value,
        p_platform: platformFilter.value,
        p_supporter: supporterFilter.value,
        p_country: countryFilter.value,
        p_sort_col: sortCol.value,
        p_sort_dir: sortDir.value,
        p_limit: perPage.value,
        p_offset: (page.value - 1) * perPage.value,
      })

      if (error != null)
        throw error

      users.value = (data ?? []).map((row): AdminUserRecord => {
        const r = row as typeof row & { lastfm_username: string | null }
        return {
          id: r.user_id,
          username: r.username,
          country: r.country,
          birthday: r.birthday,
          created_at: r.created_at,
          modified_at: r.modified_at,
          modified_by: r.modified_by,
          supporter_lifetime: r.supporter_lifetime ?? false,
          supporter_patreon: r.supporter_patreon ?? false,
          patreon_id: r.patreon_id,
          steam_id: r.steam_id,
          discord_id: r.discord_id,
          lastfm_username: r.lastfm_username,
          introduction: r.introduction,
          markdown: r.markdown,
          banned: r.banned ?? false,
          ban_reason: r.ban_reason,
          ban_start: r.ban_start,
          ban_end: r.ban_end,
          last_seen: r.last_seen,
          website: r.website,
          public: r.public ?? false,
          rich_presence_enabled: r.rich_presence_enabled ?? false,
          has_teamspeak: r.has_teamspeak ?? false,
          role: r.role,
          email: r.email,
          is_confirmed: r.is_confirmed ?? false,
          discord_display_name: r.discord_display_name,
          auth_provider: r.auth_provider,
          auth_providers: r.auth_providers ?? [],
          platform_count: r.platform_count ?? 0,
          is_supporter: r.is_supporter ?? false,
          is_banned: r.is_banned ?? false,
          role_sort: r.role_sort ?? 0,
          total_count: Number(r.total_count ?? 0),
        }
      })

      totalCount.value = users.value[0]?.total_count ?? 0
    }
    catch (err: unknown) {
      console.error('Error fetching users:', err)
      errorMessage.value = (err as Error).message || 'An error occurred while loading users'
    }
    finally {
      loading.value = false
      initialLoad.value = false
      inflight.value = false
    }
  }

  // ─── Pagination / sort helpers ────────────────────────────────────────────

  function setPage(n: number): void {
    page.value = n
  }

  function setSort(col: AdminUserSortCol, dir: SortDir): void {
    sortCol.value = col
    sortDir.value = dir
  }

  // ─── Profile builder ──────────────────────────────────────────────────────

  function buildAdminProfile(user: AdminUserRecord): AdminUserProfile {
    return {
      id: user.id,
      username: user.username ?? '',
      country: user.country,
      birthday: user.birthday,
      created_at: user.created_at,
      modified_at: user.modified_at,
      modified_by: user.modified_by,
      supporter_lifetime: user.supporter_lifetime,
      supporter_patreon: user.supporter_patreon,
      patreon_id: user.patreon_id,
      steam_id: user.steam_id,
      discord_id: user.discord_id,
      lastfm_username: user.lastfm_username,
      introduction: user.introduction,
      markdown: user.markdown,
      banned: user.banned,
      ban_reason: user.ban_reason,
      ban_start: user.ban_start,
      ban_end: user.ban_end,
      last_seen: user.last_seen,
      website: user.website,
      public: user.public,
      rich_presence_enabled: user.rich_presence_enabled,
      has_teamspeak: user.has_teamspeak,
      email: user.email,
      role: user.role,
      confirmed: user.is_confirmed,
      discord_display_name: user.discord_display_name,
      auth_provider: user.auth_provider,
      auth_providers: user.auth_providers,
    }
  }

  return {
    loading,
    initialLoad,
    errorMessage,
    users,
    totalCount,
    page,
    sortCol,
    sortDir,
    search,
    roleFilter,
    statusFilter,
    providerFilter,
    platformFilter,
    supporterFilter,
    countryFilter,
    availableCountries,
    fetchCountries,
    fetchUsers,
    setPage,
    setSort,
    buildAdminProfile,
  }
}
