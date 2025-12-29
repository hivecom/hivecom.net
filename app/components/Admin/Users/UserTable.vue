<script setup lang="ts">
import type { Ref } from 'vue'
import type { Database, Tables } from '@/types/database.types'
import { Alert, Button, CopyClipboard, defineTable, Flex, Pagination, Table, Tooltip } from '@dolanske/vui'
import { computed, inject, onBeforeMount, ref, watch } from 'vue'

import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import RoleIndicator from '@/components/Shared/RoleIndicator.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import UserLink from '@/components/Shared/UserLink.vue'
import { isBanActive } from '@/lib/banStatus'
import { getUserActivityStatus } from '@/lib/lastSeen'
import { useBreakpoint } from '@/lib/mediaQuery'
import UserActions from './UserActions.vue'
import UserFilters from './UserFilters.vue'
import UserStatusIndicator from './UserStatusIndicator.vue'

// Type for user profile from query - only includes fields we actually select
type QueryUserProfile = Pick<Tables<'profiles'>, | 'id'
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
  | 'website'>

type AdminUserProfile = QueryUserProfile & {
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

// Type for user action
interface UserAction {
  user: AdminUserProfile
  type: 'ban' | 'unban' | 'edit' | 'delete' | null
  banDuration?: string
  banReason?: string
}

// Define interface for Select options
interface SelectOption {
  label: string
  value: string
}

// Emits
const emit = defineEmits<{
  userSelected: [user: AdminUserProfile]
  action: [action: UserAction]
}>()

// Define model value for refresh signal to parent
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

// Get current user
const currentUser = useSupabaseUser()

// Define query for profiles with user roles
const supabase = useSupabaseClient<Database>()
const _profilesQuery = supabase.from('profiles').select(`
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
  website
`)

// Define interface for transformed user data
interface TransformedUser {
  'Confirmed': boolean
  'Username': string
  'UUID': string
  'Email': string | null
  'Role': number
  'Status': 'active' | 'banned'
  'Providers': string
  'Last Seen': number
  'Platforms': number
  'Supporter': boolean
  'Joined': string
  '_lastSeenVariant': 'online' | 'fresh' | 'light' | 'lighter' | 'lightest'
  '_lastSeenText': string
  '_original': AdminUserProfile
}

// Data states
const loading = ref(true)
const errorMessage = ref('')
const users = ref<QueryUserProfile[]>([])
const userRoles = ref<Record<string, string | null>>({})
const userEmails = ref<Record<string, string | null>>({})
const userConfirmed = ref<Record<string, boolean>>({})
const userDiscordDisplayName = ref<Record<string, string | null>>({})
const userAuthProvider = ref<Record<string, string | null>>({})
const userAuthProviders = ref<Record<string, string[] | null>>({})
const search = ref('')

const adminTablePerPage = inject<Ref<number>>('adminTablePerPage', computed(() => 10))
const roleFilter = ref<SelectOption[]>()
const statusFilter = ref<SelectOption[]>()
const isBelowMedium = useBreakpoint('<m')

// User action state
const userAction = ref<UserAction | null>(null)
const actionLoading = ref<Record<string, Record<string, boolean>>>({})

// Filter options
const roleOptions: SelectOption[] = [
  { label: 'Admin', value: 'admin' },
  { label: 'Moderator', value: 'moderator' },
]

const statusOptions: SelectOption[] = [
  { label: 'Active', value: 'active' },
  { label: 'Banned', value: 'banned' },
]

// Fetch users data
async function fetchUsers() {
  loading.value = true
  errorMessage.value = ''

  try {
    // Get profiles data
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
        website
      `)
      .order('created_at', { ascending: false })

    if (profilesError)
      throw profilesError

    users.value = profilesData || []

    // Get user roles data separately
    const { data: rolesData, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id, role')

    if (rolesError) {
      console.warn('Could not fetch user roles:', rolesError)
      // Don't throw error - continue without roles
    }
    else {
      // Map roles by user ID (single role per user)
      const rolesMap: Record<string, string | null> = {}
      rolesData?.forEach((roleRecord) => {
        rolesMap[roleRecord.user_id] = roleRecord.role
      })
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
      emailsMap[user_id] = email
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

// Helper function to get user status
function getUserStatus(user: QueryUserProfile, _role: string | null): 'active' | 'banned' {
  const activeBan = isBanActive(user.banned ?? false, user.ban_end ?? null)
  return activeBan ? 'banned' : 'active'
}

function getRoleSortValue(role: string | null | undefined): number {
  switch (role) {
    case 'admin':
      return 2
    case 'moderator':
      return 1
    default:
      return 0
  }
}

function getLastSeenVariant(status: ReturnType<typeof getUserActivityStatus> | null): 'online' | 'fresh' | 'light' | 'lighter' | 'lightest' {
  if (!status)
    return 'lightest'

  if (Number.isNaN(status.lastSeenTimestamp.getTime()))
    return 'lightest'

  if (status.isActive)
    return 'online'

  const diffMs = Date.now() - status.lastSeenTimestamp.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  // Last 24 hours
  if (diffHours < 24)
    return 'fresh'

  // Last 3 days
  if (diffDays < 3)
    return 'light'

  // Last 14 days
  if (diffDays < 14)
    return 'lighter'

  // > 14 days
  return 'lightest'
}

function getLastSeenTextClass(variant: TransformedUser['_lastSeenVariant']): string {
  switch (variant) {
    case 'online':
      return 'last-seen-online'
    case 'fresh':
      return 'text-color'
    case 'light':
      return 'text-color-light'
    case 'lighter':
      return 'text-color-lighter'
    case 'lightest':
      return 'text-color-lightest'
  }
}

// Filter based on search and filters
const filteredData = computed<TransformedUser[]>(() => {
  let filtered = users.value

  // Apply search filter
  if (search.value) {
    const searchTerm = search.value.toLowerCase()
    filtered = filtered.filter((user: QueryUserProfile) => {
      const usernameMatch = user.username?.toLowerCase().includes(searchTerm)
      const idMatch = user.id?.toLowerCase().includes(searchTerm)
      const emailValue = getUserEmail(user.id)?.toLowerCase() ?? ''
      const emailMatch = emailValue.includes(searchTerm)
      return Boolean(usernameMatch || idMatch || emailMatch)
    })
  }

  // Apply role filters
  if (roleFilter.value && roleFilter.value.length > 0) {
    filtered = filtered.filter((user: QueryUserProfile) => {
      const role = userRoles.value[user.id] || null
      return roleFilter.value?.some(roleOpt => role === roleOpt.value)
    })
  }

  // Apply status filters
  if (statusFilter.value && statusFilter.value.length > 0) {
    filtered = filtered.filter((user: QueryUserProfile) => {
      const role = userRoles.value[user.id] || null
      const status = getUserStatus(user, role)
      return statusFilter.value?.some(statusOpt => status === statusOpt.value)
    })
  }

  // Transform the data into explicit key-value pairs
  return filtered.map((user: QueryUserProfile) => {
    const role = userRoles.value[user.id] || null
    const roleSort = getRoleSortValue(role)
    const status = getUserStatus(user, role)
    const isSupporter = !!(user.supporter_lifetime || user.supporter_patreon)
    const activityStatus = user.last_seen ? getUserActivityStatus(user.last_seen) : null
    const email = getUserEmail(user.id)
    const confirmed = getUserConfirmedState(user.id)
    const discordDisplayName = getUserDiscordDisplayName(user.id)
    const platformCount = [user.steam_id, user.discord_id, user.patreon_id].filter(Boolean).length
    const lastSeenVariant = getLastSeenVariant(activityStatus)
    const authProvider = getUserAuthProvider(user.id)
    const authProviders = getUserAuthProviders(user.id)
    const normalizedProviders = normalizeAuthProviders(authProviders, authProvider)

    const lastSeenMs = activityStatus && !Number.isNaN(activityStatus.lastSeenTimestamp.getTime())
      ? activityStatus.lastSeenTimestamp.getTime()
      : 0
    const lastSeenText = lastSeenMs > 0 ? (activityStatus?.lastSeenText || 'Never') : 'Never'

    return {
      'Confirmed': confirmed,
      'Username': user.username || 'Unknown',
      'Email': email,
      'UUID': user.id,
      'Role': roleSort,
      'Status': status,
      'Providers': normalizedProviders.join(', '),
      'Last Seen': lastSeenMs,
      'Platforms': platformCount,
      'Supporter': isSupporter,
      'Joined': user.created_at,
      '_lastSeenVariant': lastSeenVariant,
      '_lastSeenText': lastSeenText,
      '_original': {
        id: user.id,
        username: user.username || 'Unknown',
        country: user.country,
        birthday: user.birthday,
        created_at: user.created_at,
        modified_at: user.modified_at,
        modified_by: user.modified_by,
        supporter_patreon: user.supporter_patreon || false,
        supporter_lifetime: user.supporter_lifetime || false,
        badges: user.badges || [],
        patreon_id: user.patreon_id,
        steam_id: user.steam_id,
        discord_id: user.discord_id,
        introduction: user.introduction,
        markdown: user.markdown,
        banned: user.banned || false,
        ban_reason: user.ban_reason,
        ban_start: user.ban_start,
        ban_end: user.ban_end,
        last_seen: user.last_seen,
        website: user.website || null,
        role,
        email,
        confirmed,
        discord_display_name: discordDisplayName,
        auth_provider: authProvider,
        auth_providers: authProviders,
      },
    }
  })
})

const totalCount = computed(() => users.value.length)
const filteredCount = computed(() => filteredData.value.length)
const isFiltered = computed(() => Boolean(
  search.value
  || (roleFilter.value && roleFilter.value.length > 0)
  || (statusFilter.value && statusFilter.value.length > 0),
))

// Table configuration
const { headers, rows, pagination, setPage, setSort, options } = defineTable(filteredData, {
  pagination: {
    enabled: true,
    perPage: adminTablePerPage.value,
  },
  select: false,
})

watch(adminTablePerPage, (perPage) => {
  options.value.pagination.perPage = perPage
  setPage(1)
})

// Set default sorting to newest join date
setSort('Joined', 'desc')

function handleUserClick(userData: unknown) {
  // userData might be transformed by defineTable, so we need to check its structure
  const user = (userData as TransformedUser)._original || (userData as AdminUserProfile)
  emit('userSelected', user)
}

// Check if action is loading for a specific user and action type
function isActionLoading(userId: string, action: string): boolean {
  return !!(actionLoading.value[userId]?.[action])
}

// Watch for action completion to refresh data
watch(() => userAction.value, (action) => {
  if (action && action.type && action.type !== null) {
    // Emit the action to the parent component
    emit('action', action)

    const actionType = action.type // Store in variable for type safety
    const userId = action.user.id

    // Set loading state
    if (!actionLoading.value[userId]) {
      actionLoading.value[userId] = {}
    }
    actionLoading.value[userId][actionType] = true

    // After action completes, refresh the data
    setTimeout(() => {
      fetchUsers()
      if (actionLoading.value[userId] && actionType) {
        actionLoading.value[userId][actionType] = false
      }
    }, 1500)
  }
})

// Watch for refresh signal changes to trigger data refresh
watch(() => refreshSignal.value, (newValue, oldValue) => {
  // Only fetch if the signal actually changed and it's not the initial load
  if (newValue !== oldValue && newValue > 0) {
    fetchUsers()
  }
}, { immediate: false })

// Clear all filters
function clearFilters() {
  search.value = ''
  roleFilter.value = undefined
  statusFilter.value = undefined
}

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

function normalizeAuthProviders(providers: readonly string[] | null | undefined, provider: string | null | undefined): string[] {
  const combined = new Set<string>()
  ;(providers ?? []).forEach(p => combined.add(p))
  if (provider)
    combined.add(provider)
  return Array.from(combined)
}

function getProviderInfo(provider: string) {
  const normalized = provider.toLowerCase()

  const providers: Record<string, { icon: string, label: string }> = {
    google: { icon: 'ph:google-logo', label: 'Google' },
    discord: { icon: 'ph:discord-logo', label: 'Discord' },
    email: { icon: 'ph:envelope-simple', label: 'Email' },
  }

  return providers[normalized] || { icon: 'ph:identification-card', label: provider }
}

// Get platform icon name and display info
function getPlatformInfo(platform: string) {
  const platformIcons: Record<string, { icon: string, label: string, color: string }> = {
    steam: { icon: 'ph:steam-logo', label: 'Steam', color: 'var(--color-text-blue)' },
    discord: { icon: 'ph:discord-logo', label: 'Discord', color: 'var(--color-text-purple)' },
    patreon: { icon: 'ph:patreon-logo', label: 'Patreon', color: 'var(--color-accent)' },
  }

  return platformIcons[platform] || { icon: 'ph:question', label: 'Unknown', color: 'var(--color-text-light)' }
}

// Lifecycle
onBeforeMount(fetchUsers)

// Define refresh function for parent components
defineExpose({
  refresh: fetchUsers,
})
</script>

<template>
  <!-- Error message -->
  <Alert v-if="errorMessage" variant="danger">
    {{ errorMessage }}
  </Alert>

  <!-- Loading state -->
  <template v-else-if="loading">
    <Flex gap="s" column expand>
      <!-- Header and filters -->
      <UserFilters
        v-model:search="search"
        v-model:role-filter="roleFilter"
        v-model:status-filter="statusFilter"
        :role-options="roleOptions"
        :status-options="statusOptions"
        :expand="isBelowMedium"
        @clear-filters="clearFilters"
      />

      <!-- Table skeleton -->
      <TableSkeleton
        :columns="11"
        :rows="10"
        :show-actions="true"
        compact
      />
    </Flex>
  </template>

  <Flex v-else gap="s" column expand>
    <!-- Header and filters -->
    <Flex :column="isBelowMedium" :x-between="!isBelowMedium" :x-start="isBelowMedium" y-center gap="s" expand>
      <UserFilters
        v-model:search="search"
        v-model:role-filter="roleFilter"
        v-model:status-filter="statusFilter"
        :role-options="roleOptions"
        :status-options="statusOptions"
        :expand="isBelowMedium"
        @clear-filters="clearFilters"
      />

      <Flex
        gap="s"
        :y-center="!isBelowMedium"
        :y-start="isBelowMedium"
        :wrap="isBelowMedium"
        :x-end="!isBelowMedium"
        :x-center="isBelowMedium"
        :x-start="isBelowMedium"
        :expand="isBelowMedium"
      >
        <span class="text-color-lighter text-s" :class="{ 'text-center': isBelowMedium }">
          {{ isFiltered ? `Filtered ${filteredCount}` : `Total ${totalCount}` }}
        </span>
      </Flex>
    </Flex>

    <TableContainer>
      <Table.Root v-if="rows && rows.length > 0" separate-cells :loading="loading">
        <template #header>
          <Table.Head v-for="header in headers.filter(header => !header.label.startsWith('_'))" :key="header.label" sort :header />
          <Table.Head>Actions</Table.Head>
        </template>

        <template #body>
          <tr v-for="user in rows" :key="user._original.id" class="clickable-row" @click="handleUserClick(user)">
            <Table.Cell class="confirmed-cell" @click.stop>
              <Tooltip placement="top">
                <template #tooltip>
                  <div>{{ user.Confirmed ? 'User confirmed (via social auth or email)' : 'Not confirmed' }}</div>
                </template>
                <span v-if="user.Confirmed" class="confirmed-check">
                  <Icon name="ph:check" size="16" />
                </span>
                <span v-else class="unconfirmed-x">
                  <Icon name="ph:x" size="16" />
                </span>
              </Tooltip>
            </Table.Cell>

            <Table.Cell class="username-cell">
              <div class="username-content">
                <UserLink :user-id="user._original.id" />
              </div>
            </Table.Cell>

            <Table.Cell class="email-cell" @click.stop>
              <template v-if="user.Email">
                <CopyClipboard :text="user.Email" confirm>
                  <Button variant="gray" plain size="s" class="email-button">
                    <template #start>
                      <Icon name="ph:copy" />
                    </template>
                    <span class="text-xxs">{{ user.Email }}</span>
                  </Button>
                </CopyClipboard>
              </template>
              <span v-else class="text-color-light text-xxs">
                No email on file
              </span>
            </Table.Cell>

            <Table.Cell class="uuid-cell" @click.stop>
              <CopyClipboard :text="user.UUID" confirm>
                <Button variant="gray" plain size="s" class="uuid-button">
                  <template #start>
                    <Icon name="ph:copy" />
                  </template>
                  <span class="text-xxs">{{ user.UUID }}</span>
                </Button>
              </CopyClipboard>
            </Table.Cell>

            <Table.Cell class="role-cell">
              <RoleIndicator
                :role="user._original.role"
                size="s"
              />
            </Table.Cell>

            <Table.Cell class="status-cell">
              <UserStatusIndicator :status="user.Status" :show-label="true" />
            </Table.Cell>

            <Table.Cell class="providers-cell" @click.stop>
              <Flex gap="xs" y-center :wrap="false">
                <template
                  v-for="provider in normalizeAuthProviders(user._original.auth_providers ?? null, user._original.auth_provider ?? null)"
                  :key="provider"
                >
                  <Tooltip placement="top">
                    <template #tooltip>
                      <div>{{ getProviderInfo(provider).label }}</div>
                    </template>
                    <Button variant="gray" size="s" square class="provider-button">
                      <Icon :name="getProviderInfo(provider).icon" size="16" />
                    </Button>
                  </Tooltip>
                </template>

                <span
                  v-if="normalizeAuthProviders(user._original.auth_providers ?? null, user._original.auth_provider ?? null).length === 0"
                  class="text-color-light text-s"
                >
                  None
                </span>
              </Flex>
            </Table.Cell>

            <Table.Cell class="last-seen-cell">
              <Flex gap="xs" y-center>
                <span v-if="user._lastSeenVariant === 'online'" class="online-dot" />
                <span
                  class="text-s"
                  :class="getLastSeenTextClass(user._lastSeenVariant)"
                >
                  {{ user._lastSeenText }}
                </span>
              </Flex>
            </Table.Cell>

            <Table.Cell class="platform-connections-cell" @click.stop>
              <Flex gap="xs" y-center>
                <!-- Steam Connection -->
                <Tooltip v-if="user._original.steam_id" placement="top">
                  <template #tooltip>
                    <div>Steam ID: {{ user._original.steam_id }}</div>
                  </template>
                  <CopyClipboard :text="user._original.steam_id" confirm>
                    <Button variant="gray" size="s" square class="platform-button steam">
                      <Icon :name="getPlatformInfo('steam').icon" size="16" />
                    </Button>
                  </CopyClipboard>
                </Tooltip>

                <!-- Discord Connection -->
                <Tooltip v-if="user._original.discord_id" placement="top">
                  <template #tooltip>
                    <div>
                      <div v-if="user._original.discord_display_name">
                        Discord: {{ user._original.discord_display_name }}
                      </div>
                      <div v-else>
                        Discord: Unknown
                      </div>
                      <div>Discord ID: {{ user._original.discord_id }}</div>
                    </div>
                  </template>
                  <CopyClipboard :text="user._original.discord_id" confirm>
                    <Button variant="gray" size="s" square class="platform-button discord">
                      <Icon :name="getPlatformInfo('discord').icon" size="16" />
                    </Button>
                  </CopyClipboard>
                </Tooltip>

                <!-- Patreon Connection -->
                <Tooltip v-if="user._original.patreon_id" placement="top">
                  <template #tooltip>
                    <div>Patreon ID: {{ user._original.patreon_id }}</div>
                  </template>
                  <CopyClipboard :text="user._original.patreon_id" confirm>
                    <Button variant="gray" size="s" square class="platform-button patreon">
                      <Icon :name="getPlatformInfo('patreon').icon" size="16" />
                    </Button>
                  </CopyClipboard>
                </Tooltip>

                <!-- No connections indicator -->
                <span v-if="!user._original.steam_id && !user._original.discord_id && !user._original.patreon_id" class="text-color-light text-s">
                  No connections
                </span>
              </Flex>
            </Table.Cell>

            <Table.Cell class="supporter-cell">
              <span
                :class="{ 'supporter-yes': user.Supporter,
                          'supporter-no': !user.Supporter }"
              >
                {{ user.Supporter ? 'Yes' : 'No' }}
              </span>
            </Table.Cell>

            <Table.Cell class="joined-cell">
              <TimestampDate :date="user.Joined" />
            </Table.Cell>

            <Table.Cell class="actions-cell" @click.stop>
              <UserActions
                v-model="userAction"
                :user="user._original"
                :status="user.Status"
                :is-loading="(action) => isActionLoading(user._original.id, action)"
                :current-user-id="currentUser?.id"
                variant="compact"
              />
            </Table.Cell>
          </tr>
        </template>

        <template v-if="filteredData.length > adminTablePerPage" #pagination>
          <Pagination :pagination="pagination" @change="setPage" />
        </template>
      </Table.Root>

      <!-- No results message -->
      <Alert v-else-if="!loading" variant="info">
        No users found
      </Alert>
    </TableContainer>
  </Flex>
</template>

<style lang="scss">
.confirmed-check {
  .iconify {
    color: var(--color-text-green) !important;
  }

  display: inline-flex;
  align-items: center;
}

.unconfirmed-x {
  .iconify {
    color: var(--color-text-red) !important;
  }

  display: inline-flex;
  align-items: center;
}

.provider-button {
  transition: all 0.2s ease;
}

.platform-button {
  transition: all 0.2s ease;

  &.steam {
    &:hover {
      background-color: var(--color-bg-blue-lowered);
      color: var(--color-text-blue);
    }
  }

  &.discord {
    &:hover {
      background-color: var(--color-bg-purple-lowered);
      color: var(--color-text-purple);
    }
  }

  &.patreon {
    &:hover {
      background-color: var(--color-bg-accent-lowered);
      color: var(--color-accent);
    }
  }
}
</style>

<style scoped lang="scss">
.user-table-container {
  width: 100%;
}

.online-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: var(--color-text-green) !important;
  display: inline-block;
}

.last-seen-online {
  color: var(--color-text-green) !important;
}

.user-row {
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.user-row:hover {
  background-color: var(--color-bg-light);
}

.username-cell {
  min-width: 200px;
}

.confirmed-cell {
  width: 64px;
}

.uuid-cell {
  min-width: 292px;
}

.uuid-button {
  font-family: monospace;
  font-size: var(--font-size-xs);
}

.uuid-text {
  color: var(--color-text-light);
}

.username-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.username {
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
}

.status-cell {
  min-width: 120px;
}

.providers-cell {
  min-width: 140px;
}

.email-cell {
  min-width: 220px;
}

.email-button {
  font-family: monospace;
  font-size: var(--font-size-xs);
}

.role-cell {
  min-width: 150px;
}

.role-list {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.role-badge {
  background-color: var(--color-accent);
  padding: 2px 6px;
  border-radius: var(--border-radius-xs);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
}

.platform-connections-cell {
  min-width: 120px;
}

.supporter-cell {
  min-width: 80px;
}

.supporter-yes {
  color: var(--color-success);
  font-weight: var(--font-weight-medium);
}

.supporter-no {
  color: var(--color-text-light);
}

.joined-cell,
.last-signin-cell {
  min-width: 120px;
  font-size: var(--font-size-s);
  color: var(--color-text-light);
}

.actions-cell {
  min-width: 150px;
  text-align: right;
}

.no-users {
  text-align: center;
  padding: var(--space-xl);
  color: var(--color-text-light);
}

.clickable-row:hover {
  td {
    cursor: pointer;
    background-color: var(--color-bg-raised);
  }
}
</style>
