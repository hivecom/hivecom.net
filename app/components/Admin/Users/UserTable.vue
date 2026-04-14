<script setup lang="ts">
import type { Ref } from 'vue'
import type { AdminUserProfile, AdminUserRecord, AdminUserSortCol } from '@/composables/useAdminUserTableData'

import { Alert, Button, CopyClipboard, defineTable, Flex, paginate, Pagination, Table, Tooltip } from '@dolanske/vui'
import { watchDebounced } from '@vueuse/core'
import { computed, inject, onBeforeMount, ref, watch } from 'vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import RoleIndicator from '@/components/Shared/RoleIndicator.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import UserLink from '@/components/Shared/UserLink.vue'
import { useAdminUserTableData } from '@/composables/useAdminUserTableData'
import { getLastSeenTextClass, getLastSeenVariant, getUserActivityStatus } from '@/lib/lastSeen'
import { useBreakpoint } from '@/lib/mediaQuery'
import UserActions from './UserActions.vue'
import UserFilters from './UserFilters.vue'
import UserStatusIndicator from './UserStatusIndicator.vue'

// ─── Types ────────────────────────────────────────────────────────────────────

// Minimal shape that UserActions component works with (username must be non-null)
interface UserActionUser {
  id: string
  username: string
  supporter_patreon: boolean
  supporter_lifetime: boolean
  patreon_id: string | null
  banned: boolean
}

// Internal v-model shape for UserActions binding
interface UserActionInternal {
  user: UserActionUser
  type: 'ban' | 'unban' | 'edit' | 'delete' | null
  banDuration?: string
  banReason?: string
}

// Emitted action shape - uses full AdminUserProfile
interface UserAction {
  user: AdminUserProfile
  type: 'ban' | 'unban' | 'edit' | 'delete' | null
  banDuration?: string
  banReason?: string
}

interface SelectOption {
  label: string
  value: string
}

// ─── Props / emits ────────────────────────────────────────────────────────────

const props = withDefaults(defineProps<{
  canViewUserEmails?: boolean
  focusUserId?: string | null
}>(), {
  canViewUserEmails: false,
  focusUserId: null,
})

const emit = defineEmits<{
  userSelected: [user: AdminUserProfile]
  action: [action: UserAction]
}>()

const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

// ─── Session user ─────────────────────────────────────────────────────────────

const currentUser = useSupabaseUser()

// ─── Layout ───────────────────────────────────────────────────────────────────

const isBelowMedium = useBreakpoint('<m')
const adminTablePerPage = inject<Ref<number>>('adminTablePerPage', computed(() => 10))

// ─── Composable ───────────────────────────────────────────────────────────────

const {
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
} = useAdminUserTableData({ perPage: adminTablePerPage })

// defineTable is used solely to provide the VUI table injection context
// (TableSelectionProvideSymbol). All pagination/sorting is server-driven.
const { rows } = defineTable(users, { pagination: { enabled: false }, select: false })

// ─── Filter options ───────────────────────────────────────────────────────────

const roleOptions: SelectOption[] = [
  { label: 'Admin', value: 'admin' },
  { label: 'Moderator', value: 'moderator' },
  { label: 'User', value: 'user' },
]

const statusOptions: SelectOption[] = [
  { label: 'Active', value: 'active' },
  { label: 'Banned', value: 'banned' },
]

// ─── Action state ─────────────────────────────────────────────────────────────

const userAction = ref<UserActionInternal | null>(null)
const actionLoading = ref<Record<string, Record<string, boolean>>>({})

// ─── Pagination ───────────────────────────────────────────────────────────────

const paginationState = computed(() => paginate(totalCount.value, page.value, adminTablePerPage.value))

const shouldShowPagination = computed(() => totalCount.value > adminTablePerPage.value)

// ─── Filters ─────────────────────────────────────────────────────────────────

const isFiltered = computed(() => search.value !== '' || roleFilter.value !== '' || statusFilter.value !== '')

function clearFilters() {
  search.value = ''
  roleFilter.value = ''
  statusFilter.value = ''
}

function handleSearchEnter() {
  page.value = 1
  void fetchUsers()
}

// ─── Sorting ─────────────────────────────────────────────────────────────────

// Columns that default to 'asc' when first clicked; everything else defaults to 'desc'
const ascDefaultCols = new Set<AdminUserSortCol>(['username', 'role'])

function handleSort(col: AdminUserSortCol) {
  if (sortCol.value === col) {
    setSort(col, sortDir.value === 'asc' ? 'desc' : 'asc')
  }
  else {
    setSort(col, ascDefaultCols.has(col) ? 'asc' : 'desc')
  }
}

function sortIcon(col: AdminUserSortCol): string {
  if (sortCol.value !== col)
    return 'ph:arrows-down-up'
  return sortDir.value === 'asc' ? 'ph:arrow-up' : 'ph:arrow-down'
}

// ─── Last-seen helpers (inline, per-row) ─────────────────────────────────────

function getLastSeenVariantFor(lastSeen: string) {
  const status = lastSeen ? getUserActivityStatus(lastSeen) : null
  return getLastSeenVariant(status)
}

function getLastSeenTextFor(lastSeen: string): string {
  if (!lastSeen)
    return 'Never'
  const status = getUserActivityStatus(lastSeen)
  if (!status || Number.isNaN(status.lastSeenTimestamp.getTime()))
    return 'Never'
  return status.lastSeenText || 'Never'
}

// ─── Auth provider helpers ────────────────────────────────────────────────────

function normalizeAuthProviders(providers: readonly string[] | null | undefined, provider: string | null | undefined): string[] {
  const combined = new Set<string>()
  ;(providers ?? []).forEach(p => combined.add(p))
  if (provider != null && provider !== '')
    combined.add(provider)
  return [...combined]
}

function getProviderInfo(provider: string) {
  const normalized = provider.toLowerCase()
  const map: Record<string, { icon: string, label: string }> = {
    google: { icon: 'ph:google-logo', label: 'Google' },
    discord: { icon: 'ph:discord-logo', label: 'Discord' },
    email: { icon: 'ph:envelope-simple', label: 'Email' },
  }
  return map[normalized] ?? { icon: 'ph:identification-card', label: provider }
}

// ─── Platform helpers ─────────────────────────────────────────────────────────

function getPlatformInfo(platform: string) {
  const map: Record<string, { icon: string, label: string, color: string }> = {
    steam: { icon: 'ph:steam-logo', label: 'Steam', color: 'var(--color-text-blue)' },
    discord: { icon: 'ph:discord-logo', label: 'Discord', color: 'var(--color-text-purple)' },
    patreon: { icon: 'ph:patreon-logo', label: 'Patreon', color: 'var(--color-accent)' },
  }
  return map[platform] ?? { icon: 'ph:question', label: 'Unknown', color: 'var(--color-text-light)' }
}

// ─── Action loading ───────────────────────────────────────────────────────────

function isActionLoading(userId: string, action: string): boolean {
  return !!(actionLoading.value[userId]?.[action])
}

// ─── Handlers ────────────────────────────────────────────────────────────────

function handleUserClick(user: AdminUserRecord) {
  emit('userSelected', buildAdminProfile(user))
}

function openUserById(userId: string | null | undefined): boolean {
  if (userId == null || userId.trim() === '')
    return false

  const normalizedTarget = userId.trim().toLowerCase()
  const match = users.value.find(u => u.id.toLowerCase() === normalizedTarget)
  if (match == null)
    return false

  emit('userSelected', buildAdminProfile(match))
  return true
}

// ─── Watches ──────────────────────────────────────────────────────────────────

// Search: debounced so we don't fire on every keystroke
watchDebounced(search, () => {
  page.value = 1
  void fetchUsers()
}, { debounce: 300 })

// Filters: immediate re-fetch on change
watch([roleFilter, statusFilter], () => {
  page.value = 1
  void fetchUsers()
})

// Sort: immediate re-fetch on change
watch([sortCol, sortDir], () => {
  page.value = 1
  void fetchUsers()
})

// Page: re-fetch when page changes (driven by setPage calls)
watch(page, () => {
  void fetchUsers()
})

// When per-page changes, reset to page 1 and re-fetch
watch(adminTablePerPage, () => {
  if (page.value !== 1) {
    setPage(1)
    // page watch in composable will trigger fetch
  }
  else {
    void fetchUsers()
  }
})

// Action: forward to parent, set loading, refresh after delay
watch(() => userAction.value, (action) => {
  if (action == null || action.type == null)
    return

  // Re-build a full AdminUserProfile for the emitted action
  const match = users.value.find(u => u.id === action.user.id)
  if (match != null) {
    emit('action', {
      type: action.type,
      banDuration: action.banDuration,
      banReason: action.banReason,
      user: buildAdminProfile(match),
    })
  }

  const actionType = action.type
  const userId = action.user.id

  actionLoading.value[userId] ??= {}
  actionLoading.value[userId][actionType] = true

  setTimeout(() => {
    void fetchUsers()
    const userActions = actionLoading.value[userId]
    if (userActions != null) {
      userActions[actionType] = false
    }
  }, 1500)
})

// Refresh signal from parent
watch(() => refreshSignal.value, (newValue, oldValue) => {
  if (newValue !== oldValue && newValue > 0) {
    void fetchUsers()
  }
}, { immediate: false })

// Focus a user by id once data loads
watch(
  () => props.focusUserId,
  (focusUserId) => {
    if (!loading.value)
      openUserById(focusUserId)
  },
  { immediate: true },
)

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onBeforeMount(() => void fetchUsers())

defineExpose({ refresh: fetchUsers })
</script>

<template>
  <Flex column expand>
    <!-- Error state -->
    <Alert v-if="errorMessage" variant="danger">
      {{ errorMessage }}
    </Alert>

    <!-- Loading state - skeleton only on initial load to avoid destroying DOM (and focus) on refetches -->
    <Flex v-else-if="initialLoad" gap="s" column expand>
      <UserFilters
        v-model:search="search"
        v-model:role-filter="roleFilter"
        v-model:status-filter="statusFilter"
        :role-options="roleOptions"
        :status-options="statusOptions"
        @clear-filters="clearFilters"
        @search-enter="handleSearchEnter"
      />
      <TableSkeleton
        :columns="props.canViewUserEmails ? 11 : 10"
        :rows="10"
        :show-actions="true"
        compact
      />
    </Flex>

    <Flex v-else gap="s" column expand>
      <!-- Filters + count row -->
      <Flex :column="isBelowMedium" :x-between="!isBelowMedium" :x-start="isBelowMedium" y-center gap="s" expand>
        <UserFilters
          v-model:search="search"
          v-model:role-filter="roleFilter"
          v-model:status-filter="statusFilter"
          :role-options="roleOptions"
          :status-options="statusOptions"
          @clear-filters="clearFilters"
          @search-enter="handleSearchEnter"
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
          <span class="text-color-lighter text-s" style="text-wrap: nowrap;" :class="{ 'text-center': isBelowMedium }">
            {{ isFiltered ? `Filtered ${totalCount}` : `Total ${totalCount}` }}
          </span>
        </Flex>
      </Flex>

      <div class="table-loading-wrapper" :class="{ 'table-loading': loading && !initialLoad }">
        <TableContainer>
          <Table.Root v-if="rows.length > 0" separate-cells>
            <template #header>
              <!-- Confirmed -->
              <Table.Head class="sortable-head" @click="handleSort('confirmed')">
                <Flex gap="xs" y-center>
                  Confirmed
                  <Icon :name="sortIcon('confirmed')" size="14" class="sort-icon" />
                </Flex>
              </Table.Head>

              <!-- Username -->
              <Table.Head class="sortable-head" @click="handleSort('username')">
                <Flex gap="xs" y-center>
                  Username
                  <Icon :name="sortIcon('username')" size="14" class="sort-icon" />
                </Flex>
              </Table.Head>

              <!-- Email - only when permitted -->
              <Table.Head v-if="props.canViewUserEmails">
                Email
              </Table.Head>

              <!-- UUID - not sortable -->
              <Table.Head>UUID</Table.Head>

              <!-- Role -->
              <Table.Head class="sortable-head" @click="handleSort('role')">
                <Flex gap="xs" y-center>
                  Role
                  <Icon :name="sortIcon('role')" size="14" class="sort-icon" />
                </Flex>
              </Table.Head>

              <!-- Status -->
              <Table.Head class="sortable-head" @click="handleSort('status')">
                <Flex gap="xs" y-center>
                  Status
                  <Icon :name="sortIcon('status')" size="14" class="sort-icon" />
                </Flex>
              </Table.Head>

              <!-- Providers - not sortable -->
              <Table.Head>Providers</Table.Head>

              <!-- Last Seen -->
              <Table.Head class="sortable-head" @click="handleSort('last_seen')">
                <Flex gap="xs" y-center>
                  Last Seen
                  <Icon :name="sortIcon('last_seen')" size="14" class="sort-icon" />
                </Flex>
              </Table.Head>

              <!-- Platforms -->
              <Table.Head class="sortable-head" @click="handleSort('platforms')">
                <Flex gap="xs" y-center>
                  Platforms
                  <Icon :name="sortIcon('platforms')" size="14" class="sort-icon" />
                </Flex>
              </Table.Head>

              <!-- Supporter -->
              <Table.Head class="sortable-head" @click="handleSort('supporter')">
                <Flex gap="xs" y-center>
                  Supporter
                  <Icon :name="sortIcon('supporter')" size="14" class="sort-icon" />
                </Flex>
              </Table.Head>

              <!-- Joined -->
              <Table.Head class="sortable-head" @click="handleSort('created_at')">
                <Flex gap="xs" y-center>
                  Joined
                  <Icon :name="sortIcon('created_at')" size="14" class="sort-icon" />
                </Flex>
              </Table.Head>

              <!-- Actions - not sortable -->
              <Table.Head>Actions</Table.Head>
            </template>

            <template #body>
              <tr v-for="user in rows" :key="user.id" class="clickable-row" @click="handleUserClick(user as unknown as AdminUserRecord)">
                <!-- Confirmed -->
                <Table.Cell class="confirmed-cell" @click.stop>
                  <Tooltip placement="top">
                    <template #tooltip>
                      <div>{{ user.is_confirmed ? 'User confirmed (via social auth or email)' : 'Not confirmed' }}</div>
                    </template>
                    <span v-if="user.is_confirmed" class="confirmed-check">
                      <Icon name="ph:check" size="16" />
                    </span>
                    <span v-else class="unconfirmed-x">
                      <Icon name="ph:x" size="16" />
                    </span>
                  </Tooltip>
                </Table.Cell>

                <!-- Username -->
                <Table.Cell class="username-cell">
                  <div class="username-content">
                    <UserAvatar :user-id="user.id" :size="20" show-preview />
                    <UserLink :user-id="user.id" />
                  </div>
                </Table.Cell>

                <!-- Email -->
                <Table.Cell v-if="props.canViewUserEmails" class="email-cell" @click.stop>
                  <template v-if="user.email != null && user.email !== ''">
                    <CopyClipboard :text="user.email" confirm>
                      <Button variant="gray" plain size="s" class="email-button">
                        <template #start>
                          <Icon name="ph:copy" />
                        </template>
                        <span class="text-xxs">{{ user.email }}</span>
                      </Button>
                    </CopyClipboard>
                  </template>
                  <span v-else class="text-color-light text-xxs">No email on file</span>
                </Table.Cell>

                <!-- UUID -->
                <Table.Cell class="uuid-cell" @click.stop>
                  <CopyClipboard :text="user.id" confirm>
                    <Button variant="gray" plain size="s" class="uuid-button">
                      <template #start>
                        <Icon name="ph:copy" />
                      </template>
                      <span class="text-xxs">{{ user.id }}</span>
                    </Button>
                  </CopyClipboard>
                </Table.Cell>

                <!-- Role -->
                <Table.Cell class="role-cell">
                  <RoleIndicator :role="user.role" size="s" />
                </Table.Cell>

                <!-- Status -->
                <Table.Cell class="status-cell">
                  <UserStatusIndicator :status="user.is_banned ? 'banned' : 'active'" :show-label="true" />
                </Table.Cell>

                <!-- Providers -->
                <Table.Cell class="providers-cell" @click.stop>
                  <Flex gap="xs" y-center :wrap="false">
                    <template
                      v-for="provider in normalizeAuthProviders(user.auth_providers, user.auth_provider)"
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
                      v-if="normalizeAuthProviders(user.auth_providers, user.auth_provider).length === 0"
                      class="text-color-light text-s"
                    >
                      None
                    </span>
                  </Flex>
                </Table.Cell>

                <!-- Last Seen -->
                <Table.Cell class="last-seen-cell">
                  <Flex gap="xs" y-center>
                    <span v-if="getLastSeenVariantFor(user.last_seen) === 'online'" class="online-dot" />
                    <span
                      class="text-s"
                      :class="getLastSeenTextClass(getLastSeenVariantFor(user.last_seen))"
                    >
                      {{ getLastSeenTextFor(user.last_seen) }}
                    </span>
                  </Flex>
                </Table.Cell>

                <!-- Platform connections -->
                <Table.Cell class="platform-connections-cell" @click.stop>
                  <Flex gap="xs" y-center>
                    <Tooltip v-if="user.steam_id != null && user.steam_id !== ''" placement="top">
                      <template #tooltip>
                        <div>Steam ID: {{ user.steam_id }}</div>
                      </template>
                      <CopyClipboard :text="user.steam_id" confirm>
                        <Button variant="gray" size="s" square class="platform-button steam">
                          <Icon :name="getPlatformInfo('steam').icon" size="16" />
                        </Button>
                      </CopyClipboard>
                    </Tooltip>

                    <Tooltip v-if="user.discord_id != null && user.discord_id !== ''" placement="top">
                      <template #tooltip>
                        <div>
                          <div v-if="user.discord_display_name != null && user.discord_display_name !== ''">
                            Discord: {{ user.discord_display_name }}
                          </div>
                          <div v-else>
                            Discord: Unknown
                          </div>
                          <div>Discord ID: {{ user.discord_id }}</div>
                        </div>
                      </template>
                      <CopyClipboard :text="user.discord_id" confirm>
                        <Button variant="gray" size="s" square class="platform-button discord">
                          <Icon :name="getPlatformInfo('discord').icon" size="16" />
                        </Button>
                      </CopyClipboard>
                    </Tooltip>

                    <Tooltip v-if="user.patreon_id != null && user.patreon_id !== ''" placement="top">
                      <template #tooltip>
                        <div>Patreon ID: {{ user.patreon_id }}</div>
                      </template>
                      <CopyClipboard :text="user.patreon_id" confirm>
                        <Button variant="gray" size="s" square class="platform-button patreon">
                          <Icon :name="getPlatformInfo('patreon').icon" size="16" />
                        </Button>
                      </CopyClipboard>
                    </Tooltip>

                    <span
                      v-if="(user.steam_id == null || user.steam_id === '') && (user.discord_id == null || user.discord_id === '') && (user.patreon_id == null || user.patreon_id === '')"
                      class="text-color-light text-s"
                    >
                      No connections
                    </span>
                  </Flex>
                </Table.Cell>

                <!-- Supporter -->
                <Table.Cell class="supporter-cell">
                  <span class="text-s">{{ user.is_supporter ? 'Yes' : 'No' }}</span>
                </Table.Cell>

                <!-- Joined -->
                <Table.Cell class="joined-cell">
                  <TimestampDate :date="user.created_at" />
                </Table.Cell>

                <!-- Actions -->
                <Table.Cell class="actions-cell" @click.stop>
                  <UserActions
                    v-model="(userAction as UserActionInternal | null)"
                    :user="{
                      id: user.id,
                      username: user.username ?? user.id,
                      supporter_patreon: user.supporter_patreon,
                      supporter_lifetime: user.supporter_lifetime,
                      patreon_id: user.patreon_id ?? null,
                      banned: user.banned,
                    }"
                    :status="user.is_banned ? 'banned' : 'active'"
                    :is-loading="(action) => isActionLoading(user.id, action)"
                    :current-user-id="currentUser?.id"
                    size="s"
                  />
                </Table.Cell>
              </tr>
            </template>

            <template v-if="shouldShowPagination" #pagination>
              <Pagination :pagination="paginationState" @change="setPage" />
            </template>
          </Table.Root>

          <Alert v-else-if="!loading && rows.length === 0" variant="info">
            No users found
          </Alert>
        </TableContainer>
      </div>
    </Flex>
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
  border-radius: var(--border-radius-pill);
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

.sortable-head {
  cursor: pointer;
  user-select: none;

  &:hover {
    color: var(--color-text);
  }
}

.sort-icon {
  color: var(--color-text-lighter);
  flex-shrink: 0;
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
  align-items: center;
  gap: var(--space-xs);
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

.table-loading-wrapper {
  width: 100%;
  overflow: hidden;
  transition: opacity var(--transition-slow);
}

.table-loading {
  opacity: 0.4;
  pointer-events: none;
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
