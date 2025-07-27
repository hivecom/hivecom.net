<script setup lang="ts">
import { Alert, Badge, Card, Flex, Skeleton } from '@dolanske/vui'

import RoleKPIs from '@/components/Admin/Roles/RoleKPIs.vue'

// Get admin permissions
const { hasPermission } = useAdminPermissions()

// Permission checks
const canViewRoles = computed(() => hasPermission('roles.read'))

// Ensure user has permission to view roles
if (!canViewRoles.value) {
  throw createError({
    statusCode: 403,
    statusMessage: 'Insufficient permissions to view roles',
  })
}

// Supabase client
const supabase = useSupabaseClient()

// Reactive data
const loading = ref(true)
const errorMessage = ref('')
const rolePermissions = ref<{ role: string, permission: string }[]>([])
const refreshSignal = ref(0)

// Default permissions for users without roles (based on RLS policies)
// These represent what authenticated users can do without having a specific role
const defaultUserPermissions = [
  // Global read access - can view public data
  'announcements.read',
  'events.read',
  'games.read',
  'gameservers.read',
  'profiles.read',
  'referendums.read',
  'roles.read',
  // Own profile management - can only update their own profile
  'profiles.update.own',
  // Complaint system - can create and view their own complaints
  'complaints.create.own',
  'complaints.read.own',
  // Referendum participation - can vote on existing referendums (not create them)
  'referendum_votes.create',
  'referendum_votes.update.own',
  'referendum_votes.delete.own',
]

// Grouped permissions by role
const permissionsByRole = computed(() => {
  const grouped: Record<string, string[]> = {}

  // Add database role permissions
  rolePermissions.value.forEach(({ role, permission }) => {
    if (!grouped[role]) {
      grouped[role] = []
    }
    grouped[role].push(permission)
  })

  // Add default user permissions
  grouped.user = [...defaultUserPermissions]

  // Sort permissions within each role
  Object.keys(grouped).forEach((role) => {
    if (grouped[role]) {
      grouped[role].sort()
    }
  })

  return grouped
})

// Group permissions by category for better display
const groupedPermissions = computed(() => {
  const result: Record<string, Record<string, string[]>> = {}

  Object.entries(permissionsByRole.value).forEach(([role, permissions]) => {
    result[role] = {}

    permissions.forEach((permission) => {
      const [category] = permission.split('.')
      if (category) {
        // Ensure role object exists
        if (!result[role]) {
          result[role] = {}
        }
        if (!result[role][category]) {
          result[role][category] = []
        }
        result[role][category].push(permission)
      }
    })
  })

  return result
})

// Available roles (from the database enum + default users)
const availableRoles = ['admin', 'moderator', 'user']

// Fetch role permissions data
async function fetchRolePermissions() {
  loading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await supabase
      .from('role_permissions')
      .select('role, permission')
      .order('role')
      .order('permission')

    if (error) {
      throw error
    }

    rolePermissions.value = data || []
  }
  catch (error: unknown) {
    errorMessage.value = (error as Error).message || 'Failed to fetch role permissions'
  }
  finally {
    loading.value = false
  }
}

// Format permission name for display
function formatPermissionName(permission: string): string {
  const parts = permission.split('.')
  const [category, action, scope] = parts

  // Handle special formatting for user permissions with scope
  if (scope === 'own' && action) {
    return `${action.charAt(0).toUpperCase() + action.slice(1)} own ${category}`
  }

  // Handle special cases for referendum voting
  if (permission === 'referendum_votes.create') {
    return 'Vote on referendums'
  }
  if (permission === 'referendum_votes.update.own') {
    return 'Update own votes'
  }
  if (permission === 'referendum_votes.delete.own') {
    return 'Delete own votes'
  }

  // Handle specific profile permissions for clarity
  if (permission === 'profiles.update.own') {
    return 'Update own profile'
  }
  if (permission === 'complaints.create.own') {
    return 'Create own complaints'
  }
  if (permission === 'complaints.read.own') {
    return 'View own complaints'
  }

  // Default formatting
  if (action) {
    return `${action.charAt(0).toUpperCase() + action.slice(1)} ${category}`
  }
  return category || permission
}

// Format category name for display
function formatCategoryName(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1)
}

// Get role color
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

// Get category icon
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

// Lifecycle
onBeforeMount(fetchRolePermissions)
</script>

<template>
  <Flex column gap="l" expand>
    <Flex column :gap="0">
      <h1>Roles & Permissions</h1>
      <p class="color-text-light">
        View role-based permissions and access control matrix
      </p>
    </Flex>

    <!-- KPIs Section -->
    <RoleKPIs v-model:refresh-signal="refreshSignal" />

    <!-- Loading state -->
    <template v-if="loading">
      <Flex gap="l" expand>
        <!-- Create skeleton for all 3 roles: admin, moderator, user -->
        <template v-for="i in 3" :key="i">
          <Card expand class="role-card">
            <template #header>
              <!-- Role Header Skeleton -->
              <Flex x-between y-center>
                <Flex y-center gap="s">
                  <Skeleton :width="80" :height="28" :radius="4" />
                  <Skeleton :width="120" :height="24" :radius="12" />
                </Flex>
                <Skeleton :width="24" :height="24" :radius="4" />
              </Flex>
            </template>

            <!-- Permissions Categories Skeleton -->
            <Flex column gap="m">
              <template v-for="j in (i === 1 ? 8 : i === 2 ? 6 : 4)" :key="j">
                <!-- Category Header -->
                <Flex y-center gap="xs" expand>
                  <Skeleton :width="16" :height="16" :radius="2" />
                  <Skeleton :width="100" :height="20" :radius="4" />
                  <Skeleton :width="30" :height="16" :radius="4" />
                </Flex>

                <!-- Permission Items -->
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
      </Flex>
    </template>

    <!-- Error state -->
    <Alert v-else-if="errorMessage" variant="danger">
      {{ errorMessage }}
    </Alert>

    <!-- Content -->
    <template v-else>
      <!-- Roles Overview -->
      <Flex gap="l" expand>
        <Card v-for="role in availableRoles" :key="role" expand class="role-card">
          <template #header>
            <!-- Role Header -->
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

          <!-- Permissions by Category -->
          <div v-if="groupedPermissions[role]" class="permissions-container">
            <div v-for="(permissions, category) in groupedPermissions[role]" :key="category" class="permission-category">
              <Flex y-center gap="xs" class="category-header">
                <Icon :name="getCategoryIcon(category)" size="1rem" class="category-icon" />
                <h4 class="category-title">
                  {{ formatCategoryName(category) }}
                </h4>
                <span class="color-text-light text-xs">({{ permissions.length }})</span>
              </Flex>

              <div class="permissions-list">
                <div v-for="permission in permissions" :key="permission" class="permission-item">
                  <Icon name="ph:check-circle" size="0.8rem" class="permission-check" />
                  <span class="permission-text">{{ formatPermissionName(permission) }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- No permissions message -->
          <div v-else class="no-permissions">
            <Icon name="ph:warning-circle" size="1.2rem" class="color-text-light" />
            <span class="color-text-light">No permissions assigned</span>
          </div>
        </Card>
      </Flex>
    </template>
  </Flex>
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

.summary-card {
  background: linear-gradient(135deg, var(--color-bg-raised) 0%, var(--color-bg-accent-raised) 100%);
}

.summary-item {
  text-align: center;
  padding: var(--space-m);
  background: var(--color-bg);
  border-radius: var(--border-radius-m);
}

.summary-value {
  font-size: var(--font-size-xxl);
  font-weight: var(--font-weight-bold);
  color: var(--color-accent);
  margin-bottom: var(--space-xs);
}

/* Responsive design */
@media (max-width: 768px) {
  .permissions-list {
    margin-left: var(--space-m);
  }
}
</style>
