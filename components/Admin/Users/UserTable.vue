<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Alert, Button, CopyClipboard, defineTable, Flex, Pagination, Table, Tooltip } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'

import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import RoleIndicator from '@/components/Shared/RoleIndicator.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import UserLink from '@/components/Shared/UserLink.vue'
import { getUserActivityStatus } from '~/utils/lastSeen'
import UserActions from './UserActions.vue'
import UserFilters from './UserFilters.vue'
import UserStatusIndicator from './UserStatusIndicator.vue'

// Type for user profile from query - only includes fields we actually select
type QueryUserProfile = Pick<Tables<'profiles'>, | 'id'
  | 'username'
  | 'created_at'
  | 'modified_at'
  | 'modified_by'
  | 'supporter_lifetime'
  | 'supporter_patreon'
  | 'patreon_id'
  | 'steam_id'
  | 'discord_id'
  | 'introduction'
  | 'markdown'
  | 'banned'
  | 'ban_reason'
  | 'ban_start'
  | 'ban_end'
  | 'last_seen'>

// Type for user action
interface UserAction {
  user: QueryUserProfile
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
  userSelected: [user: QueryUserProfile]
  action: [action: UserAction]
}>()

// Define model value for refresh signal to parent
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

// Get current user
const currentUser = useSupabaseUser()

// Define query for profiles with user roles
const supabase = useSupabaseClient()
const _profilesQuery = supabase.from('profiles').select(`
  id,
  username,
  created_at,
  modified_at,
  modified_by,
  supporter_lifetime,
  supporter_patreon,
  patreon_id,
  steam_id,
  discord_id,
  introduction,
  markdown,
  banned,
  ban_reason,
  ban_start,
  ban_end,
  last_seen
`)

// Define interface for transformed user data
interface TransformedUser {
  'Username': string
  'UUID': string
  'Role': string | null
  'Status': 'active' | 'banned'
  'Last Seen': string
  'Platforms': {
    steam: string | null
    discord: string | null
    patreon: string | null
  }
  'Supporter': boolean
  'Joined': string
  '_original': QueryUserProfile
}

// Data states
const loading = ref(true)
const errorMessage = ref('')
const users = ref<QueryUserProfile[]>([])
const userRoles = ref<Record<string, string | null>>({})
const search = ref('')
const roleFilter = ref<SelectOption[]>()
const statusFilter = ref<SelectOption[]>()

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
        created_at,
        modified_at,
        modified_by,
        supporter_lifetime,
        supporter_patreon,
        patreon_id,
        steam_id,
        discord_id,
        introduction,
        markdown,
        banned,
        ban_reason,
        ban_start,
        ban_end,
        last_seen
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
  // Check if user is actually banned
  return user.banned ? 'banned' : 'active'
}

// Filter based on search and filters
const filteredData = computed<TransformedUser[]>(() => {
  let filtered = users.value

  // Apply search filter
  if (search.value) {
    const searchTerm = search.value.toLowerCase()
    filtered = filtered.filter((user: QueryUserProfile) =>
      user.username?.toLowerCase().includes(searchTerm)
      || user.id?.toLowerCase().includes(searchTerm),
    )
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
    const status = getUserStatus(user, role)
    const isSupporter = !!(user.supporter_lifetime || user.supporter_patreon)
    const activityStatus = user.last_seen ? getUserActivityStatus(user.last_seen) : null

    return {
      'Username': user.username || 'Unknown',
      'UUID': user.id,
      'Role': role,
      'Status': status,
      'Last Seen': activityStatus?.lastSeenText || 'Never',
      'Platforms': {
        steam: user.steam_id,
        discord: user.discord_id,
        patreon: user.patreon_id,
      },
      'Supporter': isSupporter,
      'Joined': user.created_at,
      '_original': {
        id: user.id,
        username: user.username || 'Unknown',
        created_at: user.created_at,
        modified_at: user.modified_at,
        modified_by: user.modified_by,
        supporter_patreon: user.supporter_patreon || false,
        supporter_lifetime: user.supporter_lifetime || false,
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
        role,
      },
    }
  })
})

// Table configuration
const { headers, rows, pagination, setPage, setSort } = defineTable(filteredData, {
  pagination: {
    enabled: true,
    perPage: 10,
  },
  select: false,
})

// Set default sorting
setSort('Username', 'asc')

function handleUserClick(userData: unknown) {
  // userData might be transformed by defineTable, so we need to check its structure
  const user = (userData as TransformedUser)._original || (userData as QueryUserProfile)
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

    // Set loading state
    if (!actionLoading.value[action.user.id]) {
      actionLoading.value[action.user.id] = {}
    }
    actionLoading.value[action.user.id][action.type] = true

    // After action completes, refresh the data
    setTimeout(() => {
      fetchUsers()
      if (actionLoading.value[action.user.id] && action.type !== null) {
        actionLoading.value[action.user.id][action.type] = false
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
      <Flex x-between expand>
        <UserFilters
          v-model:search="search"
          v-model:role-filter="roleFilter"
          v-model:status-filter="statusFilter"
          :role-options="roleOptions"
          :status-options="statusOptions"
          @clear-filters="clearFilters"
        />
      </Flex>

      <!-- Table skeleton -->
      <TableSkeleton
        :columns="8"
        :rows="10"
        :show-actions="true"
        compact
      />
    </Flex>
  </template>

  <Flex v-else gap="s" column expand>
    <!-- Header and filters -->
    <Flex x-between expand>
      <UserFilters
        v-model:search="search"
        v-model:role-filter="roleFilter"
        v-model:status-filter="statusFilter"
        :role-options="roleOptions"
        :status-options="statusOptions"
        @clear-filters="clearFilters"
      />
    </Flex>

    <TableContainer>
      <Table.Root v-if="rows && rows.length > 0" separate-cells :loading="loading">
        <template #header>
          <Table.Head v-for="header in headers.filter(header => header.label !== '_original')" :key="header.label" sort :header />
          <Table.Head>Actions</Table.Head>
        </template>

        <template #body>
          <tr v-for="user in rows" :key="user._original.id" class="clickable-row" @click="handleUserClick(user)">
            <Table.Cell class="username-cell">
              <div class="username-content">
                <UserLink :user-id="user._original.id" />
              </div>
            </Table.Cell>

            <Table.Cell class="uuid-cell" @click.stop>
              <CopyClipboard :text="user.UUID" confirm>
                <Button variant="gray" size="s" class="uuid-button">
                  <span class="text-xxs">{{ user.UUID }}</span>
                </Button>
              </CopyClipboard>
            </Table.Cell>

            <Table.Cell class="role-cell">
              <RoleIndicator
                :role="user.Role"
                size="s"
              />
            </Table.Cell>

            <Table.Cell class="status-cell">
              <UserStatusIndicator :status="user.Status" :show-label="true" />
            </Table.Cell>

            <Table.Cell class="last-seen-cell">
              <span
                class="text-s"
                :class="{
                  'color-accent': user['Last Seen'] && user['Last Seen'].includes('Online'),
                  'color-text': user['Last Seen'] && !user['Last Seen'].includes('Online'),
                  'color-text-light': !user['Last Seen'] || user['Last Seen'] === 'Never',
                }"
              >
                {{ user['Last Seen'] }}
              </span>
            </Table.Cell>

            <Table.Cell class="platform-connections-cell" @click.stop>
              <Flex gap="xs" y-center>
                <!-- Steam Connection -->
                <Tooltip v-if="user.Platforms.steam" placement="top">
                  <template #tooltip>
                    <div>Steam ID: {{ user.Platforms.steam }}</div>
                  </template>
                  <CopyClipboard :text="user.Platforms.steam" confirm>
                    <Button variant="gray" size="s" square class="platform-button steam">
                      <Icon :name="getPlatformInfo('steam').icon" size="16" />
                    </Button>
                  </CopyClipboard>
                </Tooltip>

                <!-- Discord Connection -->
                <Tooltip v-if="user.Platforms.discord" placement="top">
                  <template #tooltip>
                    <div>Discord ID: {{ user.Platforms.discord }}</div>
                  </template>
                  <CopyClipboard :text="user.Platforms.discord" confirm>
                    <Button variant="gray" size="s" square class="platform-button discord">
                      <Icon :name="getPlatformInfo('discord').icon" size="16" />
                    </Button>
                  </CopyClipboard>
                </Tooltip>

                <!-- Patreon Connection -->
                <Tooltip v-if="user.Platforms.patreon" placement="top">
                  <template #tooltip>
                    <div>Patreon ID: {{ user.Platforms.patreon }}</div>
                  </template>
                  <CopyClipboard :text="user.Platforms.patreon" confirm>
                    <Button variant="gray" size="s" square class="platform-button patreon">
                      <Icon :name="getPlatformInfo('patreon').icon" size="16" />
                    </Button>
                  </CopyClipboard>
                </Tooltip>

                <!-- No connections indicator -->
                <span v-if="!user.Platforms.steam && !user.Platforms.discord && !user.Platforms.patreon" class="color-text-light text-s">
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

        <template v-if="filteredData.length > 10" #pagination>
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

<style scoped lang="scss">
.user-table-container {
  width: 100%;
}

/* Additional responsive adjustments for compact mode */
@media (max-width: 1200px) {
  :deep(.table-compact td),
  :deep(.table-compact th) {
    padding-left: var(--space-xs);
    padding-right: var(--space-xs);
  }
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

.uuid-cell {
  min-width: 280px;
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

.email {
  font-size: var(--font-size-s);
  color: var(--color-text-light);
  font-family: monospace;
}

.status-cell {
  min-width: 120px;
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
  color: var(--color-accent-contrast);
  padding: 2px 6px;
  border-radius: var(--border-radius-xs);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
}

.platform-connections-cell {
  min-width: 120px;
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
