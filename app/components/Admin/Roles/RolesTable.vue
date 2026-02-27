<script setup lang="ts">
import { Alert, Card, Flex, Grid, Input, searchString, Skeleton } from '@dolanske/vui'
import RoleKPIs from '@/components/Admin/Roles/RoleKPIs.vue'
import BadgeCircle from '@/components/Shared/BadgeCircle.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

const isBelowMedium = useBreakpoint('<m')

const supabase = useSupabaseClient()

const loading = ref(true)
const errorMessage = ref('')
const rolePermissions = ref<{ role: string, permission: string }[]>([])
const refreshSignal = ref(0)

const search = ref('')

const defaultUserPermissions = [
  'events.read',
  'games.read',
  'gameservers.read',
  'profiles.read',
  'referendums.read',
  'roles.read',
  'profiles.update.own',
  'complaints.create.own',
  'complaints.read.own',
  'referendum_votes.create',
  'referendum_votes.update.own',
  'referendum_votes.delete.own',
]

const permissionsByRole = computed(() => {
  const grouped: Record<string, string[]> = {}

  rolePermissions.value
    .filter(({ role, permission }) => searchString([role, permission], search.value))
    .forEach(({ role, permission }) => {
      if (!grouped[role]) {
        grouped[role] = []
      }
      grouped[role].push(permission)
    })

  grouped.user = [...defaultUserPermissions]
    .filter(permission => searchString([permission], search.value))

  Object.keys(grouped).forEach((role) => {
    if (grouped[role]) {
      grouped[role].sort()
    }
  })

  return grouped
})

const groupedPermissions = computed(() => {
  const result: Record<string, Record<string, string[]>> = {}

  Object.entries(permissionsByRole.value).forEach(([role, permissions]) => {
    const roleGroups = result[role] ?? (result[role] = {})

    permissions.forEach((permission) => {
      const [category] = permission.split('.')
      if (!category)
        return

      if (!roleGroups[category]) {
        roleGroups[category] = []
      }
      roleGroups[category].push(permission)
    })
  })

  return result
})

const availableRoles = ['admin', 'moderator', 'user']

async function fetchRolePermissions() {
  loading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await supabase
      .from('role_permissions')
      .select('role, permission')
      .order('role')
      .order('permission')

    if (error)
      throw error

    rolePermissions.value = data || []
  }
  catch (error: unknown) {
    errorMessage.value = (error as Error).message || 'Failed to fetch role permissions'
  }
  finally {
    loading.value = false
  }
}

function formatPermissionName(permission: string): string {
  const parts = permission.split('.')
  const [category, action, scope] = parts

  if (scope === 'own' && action) {
    return `${action.charAt(0).toUpperCase() + action.slice(1)} own ${category}`
  }

  if (permission === 'referendum_votes.create')
    return 'Vote on referendums'
  if (permission === 'referendum_votes.update.own')
    return 'Update own votes'
  if (permission === 'referendum_votes.delete.own')
    return 'Delete own votes'

  if (permission === 'profiles.update.own')
    return 'Update own profile'
  if (permission === 'complaints.create.own')
    return 'Create own complaints'
  if (permission === 'complaints.read.own')
    return 'View own complaints'

  if (action) {
    return `${action.charAt(0).toUpperCase() + action.slice(1)} ${category}`
  }
  return category || permission
}

function formatCategoryName(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1)
}

function getRoleColor(role: string): string {
  switch (role) {
    case 'admin':
      return 'var(--color-text-red)'
    case 'moderator':
      return 'var(--color-text-blue)'
    case 'user':
      return 'var(--color-text-green)'
    default:
      return 'var(--color-text)'
  }
}

function getRoleVariant(role: string) {
  switch (role) {
    case 'admin':
      return 'danger'
    case 'moderator':
      return 'info'
    case 'user':
      return 'success'
    default:
      return 'neutral'
  }
}

function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    announcements: 'ph:megaphone',
    assets: 'ph:images-square',
    complaints: 'ph:flag',
    containers: 'ph:computer-tower',
    events: 'ph:calendar-blank',
    expenses: 'ph:coins',
    forums: 'ph:chat-circle',
    funding: 'ph:coins',
    games: 'ph:game-controller',
    gameservers: 'ph:computer-tower',
    kvstore: 'ph:database',
    motds: 'ph:speaker-simple-high',
    profiles: 'ph:user',
    projects: 'ph:folder',
    referendums: 'ph:user-sound',
    referendum_votes: 'ph:user-sound',
    roles: 'ph:user',
    servers: 'ph:computer-tower',
    users: 'ph:user',
  }
  return icons[category] || 'ph:circle'
}

onBeforeMount(fetchRolePermissions)
</script>

<template>
  <!-- KPIs Section -->
  <RoleKPIs v-model:refresh-signal="refreshSignal" />

  <!-- Loading state -->
  <template v-if="loading">
    <Grid :columns="isBelowMedium ? 1 : 3" gap="l" expand>
      <template v-for="i in 3" :key="i">
        <Card expand class="role-card">
          <template #header>
            <Flex x-between y-center>
              <Flex y-center gap="s">
                <Skeleton :width="80" :height="28" :radius="4" />
                <Skeleton :width="120" :height="24" :radius="12" />
              </Flex>
              <Skeleton :width="24" :height="24" :radius="4" />
            </Flex>
          </template>

          <Flex column gap="m">
            <template v-for="j in (i === 1 ? 8 : i === 2 ? 6 : 4)" :key="j">
              <Flex y-center gap="xs" expand>
                <Skeleton :width="16" :height="16" :radius="2" />
                <Skeleton :width="100" :height="20" :radius="4" />
                <Skeleton :width="30" :height="16" :radius="4" />
              </Flex>

              <Flex class="permissions-list" style="padding-right: 24px;" gap="s" expand column>
                <template v-for="k in (Math.floor(Math.random() * 3) + 2)" :key="k">
                  <Flex y-center gap="xs" class="permission-item">
                    <Skeleton :width="12" :height="12" :radius="50" />
                    <Skeleton :height="16" :radius="4" />
                  </Flex>
                </template>
              </Flex>
            </template>
          </Flex>
        </Card>
      </template>
    </Grid>
  </template>

  <Alert v-else-if="errorMessage" variant="danger">
    {{ errorMessage }}
  </Alert>

  <template v-else>
    <Input
      v-model="search"
      placeholder="Seach for a role"
      :expand="isBelowMedium"
    >
      <template #start>
        <Icon name="ph:magnifying-glass" />
      </template>
    </Input>

    <Grid :columns="isBelowMedium ? 1 : 3" gap="l" expand>
      <Card v-for="role in availableRoles" :key="role" expand class="role-card">
        <template #header>
          <Flex x-start y-center>
            <Flex y-center gap="s">
              <h3 class="role-title flex-1" :style="{ color: getRoleColor(role) }">
                {{ role.charAt(0).toUpperCase() + role.slice(1) }}
              </h3>
            </Flex>
            <BadgeCircle :variant="getRoleVariant(role)">
              {{ permissionsByRole[role]?.length || 0 }}
            </BadgeCircle>
          </Flex>
        </template>

        <div v-if="Object.keys(groupedPermissions[role] ?? {}).length > 0" class="permissions-container">
          <div v-for="(permissions, category) in groupedPermissions[role]" :key="category" class="permission-category">
            <Flex y-center gap="xs" class="category-header">
              <Icon :name="getCategoryIcon(category)" size="14" class="category-icon" />
              <h4 class="category-title">
                {{ formatCategoryName(category) }}
              </h4>
              <span class="text-color-light text-xs">({{ permissions.length }})</span>
            </Flex>

            <div class="permissions-list">
              <div v-for="permission in permissions" :key="permission" class="permission-item">
                <!-- <Icon name="ph:check-circle" class="permission-check" size="14" /> -->
                <span class="permission-text">{{ formatPermissionName(permission) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="search" class="no-permissions">
          <Icon name="ph:warning-circle" size="1.2rem" class="text-color-light" />
          <p class="text-color-light">
            No permissions found
          </p>
        </div>

        <div v-else class="no-permissions">
          <Icon name="ph:warning-circle" size="1.2rem" class="text-color-light" />
          <p class="text-color-light">
            No permissions assigned
          </p>
        </div>
      </Card>
    </Grid>
  </template>
</template>

<style scoped lang="scss">
.role-card {
  position: relative;
  // overflow: hidden;

  :deep(.vui-card-header) {
    position: sticky;
    background-color: var(--color-bg);
    z-index: var(--z-sticky);
    margin-bottom: var(--space-m);
    border-bottom: 1px solid var(--color-border);
    top: 0;
  }
}

.role-title {
  font-size: var(--font-size-l);
  // font-weight: var(--font-weight-semibold);
  margin: 0;
}

.permissions-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-l);

  &:hover {
    .permission-text {
      color: var(--color-text);
    }
  }
}

.permission-category {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.category-header {
  margin-bottom: var(--space-xxs);
}

.category-icon {
  color: var(--color-accent);
}

.category-title {
  font-size: var(--font-size-m);
  font-weight: var(--font-weight-medium);
  margin: 0;
  color: var(--color-text);
}

.permissions-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-xxs);
  margin-left: var(--space-l);
}

.permission-item {
  width: 100% !important;
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs);
  background: var(--color-bg-raised);
  border-radius: var(--border-radius-s);
}

.permission-check {
  color: var(--color-success);
  flex-shrink: 0;
}

.permission-text {
  font-size: var(--font-size-s);
  color: var(--color-text-light);
  transition: var(--transition-fast);
}

.no-permissions {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  padding: var(--space-m);
  background: var(--color-bg-raised);
  border-radius: var(--border-radius-m);
  text-align: center;
  justify-content: center;
}

@media (max-width: 768px) {
  .permissions-list {
    margin-left: var(--space-m);
  }
}
</style>
