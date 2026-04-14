import type { Ref } from 'vue'
import type { Database } from '@/types/database.types'
import { ref } from 'vue'

type ProfileBadge = Database['public']['Enums']['profile_badge']

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
  badges: ProfileBadge[]
  patreon_id: string | null
  steam_id: string | null
  discord_id: string | null
  introduction: string | null
  markdown: string | null
  banned: boolean
  ban_reason: string | null
  ban_start: string | null
  ban_end: string | null
  last_seen: string
  website: string | null
  public: boolean
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
  badges: ProfileBadge[]
  patreon_id: string | null
  steam_id: string | null
  discord_id: string | null
  introduction: string | null
  markdown: string | null
  banned: boolean
  ban_reason: string | null
  ban_start: string | null
  ban_end: string | null
  last_seen: string
  website: string | null
  public: boolean
  email: string | null
  role?: string | null
  confirmed?: boolean
  discord_display_name?: string | null
  auth_provider?: string | null
  auth_providers?: string[] | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw RPC row shape (what Supabase actually returns before mapping)
// ─────────────────────────────────────────────────────────────────────────────

interface RawAdminUserRow {
  user_id: string
  username: string | null
  country: string | null
  birthday: string | null
  created_at: string
  modified_at: string | null
  modified_by: string | null
  supporter_lifetime: boolean
  supporter_patreon: boolean
  badges: ProfileBadge[]
  patreon_id: string | null
  steam_id: string | null
  discord_id: string | null
  introduction: string | null
  markdown: string | null
  banned: boolean
  ban_reason: string | null
  ban_start: string | null
  ban_end: string | null
  last_seen: string
  website: string | null
  public: boolean
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

  // ─── Fetch ───────────────────────────────────────────────────────────────

  async function fetchUsers(): Promise<void> {
    if (inflight.value)
      return
    inflight.value = true
    loading.value = true
    errorMessage.value = ''

    try {
      const { data, error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown, error: unknown }>)('get_admin_users_paginated', {
        p_search: search.value,
        p_role: roleFilter.value,
        p_status: statusFilter.value,
        p_sort_col: sortCol.value,
        p_sort_dir: sortDir.value,
        p_limit: perPage.value,
        p_offset: (page.value - 1) * perPage.value,
      })

      if (error != null)
        throw error

      const rows = (data ?? []) as unknown as RawAdminUserRow[]

      users.value = rows.map((row): AdminUserRecord => ({
        id: row.user_id,
        username: row.username,
        country: row.country,
        birthday: row.birthday,
        created_at: row.created_at,
        modified_at: row.modified_at,
        modified_by: row.modified_by,
        supporter_lifetime: row.supporter_lifetime ?? false,
        supporter_patreon: row.supporter_patreon ?? false,
        badges: row.badges ?? [],
        patreon_id: row.patreon_id,
        steam_id: row.steam_id,
        discord_id: row.discord_id,
        introduction: row.introduction,
        markdown: row.markdown,
        banned: row.banned ?? false,
        ban_reason: row.ban_reason,
        ban_start: row.ban_start,
        ban_end: row.ban_end,
        last_seen: row.last_seen,
        website: row.website,
        public: row.public ?? false,
        role: row.role,
        email: row.email,
        is_confirmed: row.is_confirmed ?? false,
        discord_display_name: row.discord_display_name,
        auth_provider: row.auth_provider,
        auth_providers: row.auth_providers ?? [],
        platform_count: row.platform_count ?? 0,
        is_supporter: row.is_supporter ?? false,
        is_banned: row.is_banned ?? false,
        role_sort: row.role_sort ?? 0,
        total_count: Number(row.total_count ?? 0),
      }))

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
      badges: user.badges,
      patreon_id: user.patreon_id,
      steam_id: user.steam_id,
      discord_id: user.discord_id,
      introduction: user.introduction,
      markdown: user.markdown,
      banned: user.banned,
      ban_reason: user.ban_reason,
      ban_start: user.ban_start,
      ban_end: user.ban_end,
      last_seen: user.last_seen,
      website: user.website,
      public: user.public,
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
    fetchUsers,
    setPage,
    setSort,
    buildAdminProfile,
  }
}
