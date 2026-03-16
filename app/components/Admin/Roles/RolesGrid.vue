<script setup lang="ts">
import { Alert, Card, Flex, Grid, Input, searchString, Skeleton } from '@dolanske/vui'
import RoleKPIs from '@/components/Admin/Roles/RoleKPIs.vue'
import BadgeCircle from '@/components/Shared/BadgeCircle.vue'
import { useBreakpoint } from '@/lib/mediaQuery'
import { formatCategoryName, formatPermissionName, getCategoryIcon, getRoleColor, getRoleVariant } from '@/lib/rolePermissions'

const isBelowMedium = useBreakpoint('<m')

const supabase = useSupabaseClient()

const loading = ref(true)
const errorMessage = ref('')
const rolePermissions = ref<{ role: string, permission: string }[]>([])
const refreshSignal = ref(0)

const search = ref('')

const defaultUserPermissions = [
  'containers.read',
  'discussion_topics.read',
  'discussions.read',
  'discussions.create',
  'discussions.update.own',
  'discussions.delete.own',
  'discussion_replies.read',
  'discussion_replies.create',
  'discussion_replies.update.own',
  'discussion_replies.delete.own',
  'events.read',
  'games.read',
  'gameservers.read',
  'profiles.read',
  'referendums.create',
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

  // Inject implied discussion_replies permissions for roles that can manage discussions.
  // The DB policies for reply UPDATE/DELETE gate on discussions.update/delete respectively,
  // so these aren't seeded as separate permissions but are functionally granted.
  for (const role of Object.keys(grouped)) {
    const perms = grouped[role]
    if (!perms)
      continue
    if (perms.includes('discussions.update') && !perms.includes('discussion_replies.update'))
      perms.push('discussion_replies.update')
    if (perms.includes('discussions.delete') && !perms.includes('discussion_replies.delete'))
      perms.push('discussion_replies.delete')
  }

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

          <Flex column gap="m" expand>
            <template v-for="j in (i === 1 ? 8 : i === 2 ? 6 : 4)" :key="j">
              <Flex y-center gap="xs" expand>
                <Skeleton :width="16" :height="16" :radius="2" />
                <Skeleton :width="100" :height="20" :radius="4" />
                <Skeleton :width="30" :height="16" :radius="4" />
              </Flex>

              <Flex class="permissions-list" style="padding-right: 24px;" gap="s" expand column>
                <template v-for="k in (Math.floor(Math.random() * 3) + 2)" :key="k">
                  <Flex y-center gap="xs" class="permission-item" expand>
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

        <Flex v-if="Object.keys(groupedPermissions[role] ?? {}).length > 0" column gap="l" class="permissions-container">
          <Flex v-for="(permissions, category) in groupedPermissions[role]" :key="category" column gap="xs" expand>
            <Flex y-center gap="xs" class="mb-xxs">
              <Icon :name="getCategoryIcon(category)" size="14" class="category-icon" />
              <h4 class="category-title">
                {{ formatCategoryName(category) }}
              </h4>
              <span class="text-color-light text-xs">({{ permissions.length }})</span>
            </Flex>

            <Flex column gap="xxs" class="permissions-list" expand>
              <Flex v-for="permission in permissions" :key="permission" y-center gap="xs" class="permission-item" expand style="width:96%">
                <span class="permission-text">{{ formatPermissionName(permission) }}</span>
              </Flex>
            </Flex>
          </Flex>
        </Flex>

        <Flex v-else-if="search" y-center x-center gap="s" class="no-permissions">
          <Icon name="ph:warning-circle" size="1.2rem" class="text-color-light" />
          <p class="text-color-light">
            No permissions found
          </p>
        </Flex>

        <Flex v-else y-center x-center gap="s" class="no-permissions">
          <Icon name="ph:warning-circle" size="1.2rem" class="text-color-light" />
          <p class="text-color-light">
            No permissions assigned
          </p>
        </Flex>
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
  &:hover {
    .permission-text {
      color: var(--color-text);
    }
  }
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
  margin-left: var(--space-l);
}

.permission-item {
  width: 100%;
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
  padding: var(--space-m);
  background: var(--color-bg-raised);
  border-radius: var(--border-radius-m);
  text-align: center;
}

@media (max-width: 768px) {
  .permissions-list {
    margin-left: var(--space-m);
  }
}
</style>
