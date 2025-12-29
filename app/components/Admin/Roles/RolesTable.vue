<script setup lang="ts">
import { Alert, Badge, Card, Flex, Grid, Skeleton } from '@dolanske/vui'

import RoleKPIs from '@/components/Admin/Roles/RoleKPIs.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

const isBelowMedium = useBreakpoint('<m')

const supabase = useSupabaseClient()

const loading = ref(true)
const errorMessage = ref('')
const rolePermissions = ref<{ role: string, permission: string }[]>([])
const refreshSignal = ref(0)

const defaultUserPermissions = [
  'announcements.read',
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

  rolePermissions.value.forEach(({ role, permission }) => {
    if (!grouped[role]) {
      grouped[role] = []
    }
    grouped[role].push(permission)
  })

  grouped.user = [...defaultUserPermissions]

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

function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    announcements: 'ph:megaphone',
    complaints: 'ph:warning-circle',
    containers: 'ph:cube',
    events: 'ph:calendar',
    expenses: 'ph:receipt',
    forums: 'ph:chat-circle',
    funding: 'ph:coins',
    games: 'ph:game-controller',
    gameservers: 'ph:computer-tower',
    profiles: 'ph:user-circle',
    referendums: 'ph:user-sound',
    referendum_votes: 'ph:hand-pointing',
    roles: 'ph:shield-check',
    servers: 'ph:database',
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
    <Grid :columns="isBelowMedium ? 1 : 3" gap="l" expand>
      <Card v-for="role in availableRoles" :key="role" expand class="role-card">
        <template #header>
          <Flex x-between y-center>
            <Flex y-center gap="s">
              <h3 class="role-title" :style="{ color: getRoleColor(role) }">
                {{ role.charAt(0).toUpperCase() + role.slice(1) }}
              </h3>
              <Badge
                :style="{ backgroundColor: getRoleColor(role),
                          color: 'white' }"
              >
                {{ permissionsByRole[role]?.length || 0 }} permissions
              </Badge>
            </Flex>
            <Icon name="ph:shield-check" size="1.5rem" :style="{ color: getRoleColor(role) }" />
          </Flex>
        </template>

        <div v-if="groupedPermissions[role]" class="permissions-container">
          <div v-for="(permissions, category) in groupedPermissions[role]" :key="category" class="permission-category">
            <Flex y-center gap="xs" class="category-header">
              <Icon :name="getCategoryIcon(category)" size="1rem" class="category-icon" />
              <h4 class="category-title">
                {{ formatCategoryName(category) }}
              </h4>
              <span class="text-color-light text-xs">({{ permissions.length }})</span>
            </Flex>

            <div class="permissions-list">
              <div v-for="permission in permissions" :key="permission" class="permission-item">
                <Icon name="ph:check-circle" size="0.8rem" class="permission-check" />
                <span class="permission-text">{{ formatPermissionName(permission) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="no-permissions">
          <Icon name="ph:warning-circle" size="1.2rem" class="text-color-light" />
          <span class="text-color-light">No permissions assigned</span>
        </div>
      </Card>
    </Grid>
  </template>
</template>

<style scoped lang="scss">
.role-card {
  position: relative;
  overflow: hidden;
}

.role-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  margin: 0;
}

.permissions-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
}

.permission-category {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.category-header {
  margin-bottom: var(--space-xs);
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
  gap: var(--space-xs);
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
  color: var(--color-text);
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
