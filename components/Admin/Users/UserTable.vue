<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'
import { Alert, Button, CopyClipboard, defineTable, Flex, Pagination, Table, Tooltip } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'

import RoleIndicator from '@/components/Shared/RoleIndicator.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import UserActions from './UserActions.vue'
import UserFilters from './UserFilters.vue'
import UserStatusIndicator from './UserStatusIndicator.vue'

// Define interface for Select options
interface SelectOption {
  label: string
  value: string
}

// Emits
const emit = defineEmits<{
  userSelected: [user: any]
  action: [action: any]
}>()

// Define model value for refresh signal to parent
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

// Define query for profiles with user roles
const supabase = useSupabaseClient()
const _profilesQuery = supabase.from('profiles').select(`
  id,
  username,
  created_at,
  modified_at,
  supporter_lifetime,
  supporter_patreon,
  patreon_id,
  steam_id,
  discord_id,
  introduction,
  markdown
`)

// Define interface for transformed user data
interface TransformedUser {
  Username: string
  UUID: string
  Role: string | null
  Status: 'active' | 'banned'
  Platforms: {
    steam: string | null
    discord: string | null
    patreon: string | null
  }
  Supporter: boolean
  Joined: string
  _original: {
    id: string
    username: string
    created_at: string
    modified_at: string | null
    supporter_patreon: boolean
    supporter_lifetime: boolean
    patreon_id: string | null
    steam_id: string | null
    discord_id: string | null
    introduction: string | null
    markdown: string | null
    banned: boolean
    role: string | null
  }
}

// Data states
const loading = ref(true)
const errorMessage = ref('')
const users = ref<QueryData<typeof _profilesQuery>>([])
const userRoles = ref<Record<string, string | null>>({})
const search = ref('')
const roleFilter = ref<SelectOption[]>()
const statusFilter = ref<SelectOption[]>()

// User action state
const userAction = ref<any>(null)
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
        supporter_lifetime,
        supporter_patreon,
        patreon_id,
        steam_id,
        discord_id,
        introduction,
        markdown
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
  catch (error: any) {
    console.error('Error fetching users:', error)
    errorMessage.value = error.message || 'An error occurred while loading users'
  }
  finally {
    loading.value = false
  }
}

// Helper function to get user status
function getUserStatus(_user: any, _role: string | null): 'active' | 'banned' {
  // Note: ban status checking would need to be implemented via admin API or separate table
  // For now, return 'active' unless explicitly banned
  const banned = false // TODO: Implement proper ban status checking
  return banned ? 'banned' : 'active'
}

// Filter based on search and filters
const filteredData = computed<TransformedUser[]>(() => {
  let filtered = users.value

  // Apply search filter
  if (search.value) {
    const searchTerm = search.value.toLowerCase()
    filtered = filtered.filter((user: any) =>
      user.username?.toLowerCase().includes(searchTerm)
      || user.id?.toLowerCase().includes(searchTerm),
    )
  }

  // Apply role filters
  if (roleFilter.value && roleFilter.value.length > 0) {
    filtered = filtered.filter((user: any) => {
      const role = userRoles.value[user.id] || null
      return roleFilter.value?.some(roleOpt => role === roleOpt.value)
    })
  }

  // Apply status filters
  if (statusFilter.value && statusFilter.value.length > 0) {
    filtered = filtered.filter((user: any) => {
      const role = userRoles.value[user.id] || null
      const status = getUserStatus(user, role)
      return statusFilter.value?.some(statusOpt => status === statusOpt.value)
    })
  }

  // Transform the data into explicit key-value pairs
  return filtered.map((user: any) => {
    const role = userRoles.value[user.id] || null
    const status = getUserStatus(user, role)
    const isSupporter = !!(user.supporter_lifetime || user.supporter_patreon)
    // Note: banned status would need to be checked via admin API or separate banned_users table
    const banned = false // TODO: Implement proper ban status checking

    return {
      Username: user.username || 'Unknown',
      UUID: user.id,
      Role: role,
      Status: status,
      Platforms: {
        steam: user.steam_id,
        discord: user.discord_id,
        patreon: user.patreon_id,
      },
      Supporter: isSupporter,
      Joined: user.created_at,
      _original: {
        id: user.id,
        username: user.username || 'Unknown',
        created_at: user.created_at,
        modified_at: user.modified_at,
        supporter_patreon: user.supporter_patreon || false,
        supporter_lifetime: user.supporter_lifetime || false,
        patreon_id: user.patreon_id,
        steam_id: user.steam_id,
        discord_id: user.discord_id,
        introduction: user.introduction,
        markdown: user.markdown,
        banned,
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

function handleUserClick(userData: any) {
  emit('userSelected', userData)
}

// Check if action is loading for a specific user and action type
function isActionLoading(userId: string, action: string): boolean {
  return !!(actionLoading.value[userId]?.[action])
}

// Watch for action completion to refresh data
watch(() => userAction.value, (action) => {
  if (action && action.type) {
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
      if (actionLoading.value[action.user.id]) {
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
  <Alert v-else-if="loading" variant="info">
    Loading users...
  </Alert>

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
          <tr v-for="user in rows" :key="user._original.id" class="clickable-row" @click="handleUserClick(user._original)">
            <Table.Cell class="username-cell">
              <div class="username-content">
                <span class="username">{{ user.Username }}</span>
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

<style scoped>
.user-table-container {
  width: 100%;
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
  font-weight: 500;
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
  font-weight: 500;
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
  font-weight: 500;
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
