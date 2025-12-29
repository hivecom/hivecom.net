<script setup lang="ts">
import { ref, watch } from 'vue'

import KPICard from '../KPICard.vue'
import KPIContainer from '../KPIContainer.vue'

const refreshSignal = defineModel<number>('refreshSignal')

// Role metrics
const metrics = ref({
  totalRoles: 0,
  permissionGroups: 0,
  adminUsers: 0,
  moderatorUsers: 0,
  userUsers: 0,
})

// Data fetch state
const loading = ref(true)
const errorMessage = ref('')

// Get Supabase client
const supabase = useSupabaseClient()

// Fetch role metrics
async function fetchRoleMetrics() {
  loading.value = true
  errorMessage.value = ''

  try {
    const [rolePermissionsResponse, totalUsersResponse, adminUsersResponse, moderatorUsersResponse] = await Promise.all([
      supabase
        .from('role_permissions')
        .select('role, permission'),
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true }),
      supabase
        .from('user_roles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'admin'),
      supabase
        .from('user_roles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'moderator'),
    ])

    if (rolePermissionsResponse.error)
      throw rolePermissionsResponse.error
    if (totalUsersResponse.error)
      throw totalUsersResponse.error
    if (adminUsersResponse.error)
      throw adminUsersResponse.error
    if (moderatorUsersResponse.error)
      throw moderatorUsersResponse.error

    const rolePermissions = rolePermissionsResponse.data ?? []
    const uniqueRoles = new Set(rolePermissions.map(rp => rp.role))

    const permissionGroups = new Set(
      rolePermissions
        .map(rp => rp.permission?.split('.')[0])
        .filter((group): group is string => Boolean(group)),
    )

    const totalUsers = totalUsersResponse.count ?? 0
    const adminUsers = adminUsersResponse.count ?? 0
    const moderatorUsers = moderatorUsersResponse.count ?? 0
    const userUsers = Math.max(0, totalUsers - adminUsers - moderatorUsers)

    metrics.value = {
      totalRoles: uniqueRoles.size,
      permissionGroups: permissionGroups.size,
      adminUsers,
      moderatorUsers,
      userUsers,
    }
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to fetch role metrics'
  }
  finally {
    loading.value = false
  }
}

// Watch for refresh signal from parent
watch(() => refreshSignal.value, () => {
  fetchRoleMetrics()
})

// Fetch data on component mount
onBeforeMount(fetchRoleMetrics)
</script>

<template>
  <KPIContainer>
    <KPICard
      label="Total Roles"
      :value="metrics.totalRoles"
      icon="ph:shield-check"
      variant="primary"
      :is-loading="loading"
      description="Number of distinct roles in the system (excluding users as they are not a role)"
    />

    <KPICard
      label="Permission Groups"
      :value="metrics.permissionGroups"
      icon="ph:folders"
      variant="warning"
      :is-loading="loading"
      description="Number of permission categories (e.g., users, events, etc.)"
    />

    <KPICard
      label="Admins"
      :value="metrics.adminUsers"
      icon="ph:crown"
      variant="danger"
      :is-loading="loading"
      description="Users assigned to the admin role"
    />

    <KPICard
      label="Moderators"
      :value="metrics.moderatorUsers"
      icon="ph:gavel"
      variant="gray"
      :is-loading="loading"
      description="Users assigned to the moderator role"
    />

    <KPICard
      label="Users"
      :value="metrics.userUsers"
      icon="ph:user"
      variant="success"
      :is-loading="loading"
      description="Users without an assigned admin/moderator role"
    />
  </KPIContainer>
</template>

<style scoped lang="scss">

</style>
