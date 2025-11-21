<script setup lang="ts">
import { ref, watch } from 'vue'

import KPICard from '../KPICard.vue'
import KPIContainer from '../KPIContainer.vue'

const refreshSignal = defineModel<number>('refreshSignal')

// Role metrics
const metrics = ref({
  totalRoles: 0,
  totalPermissions: 0,
  totalCategories: 0,
  adminPermissions: 0,
  moderatorPermissions: 0,
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
    // Get all role permissions
    const { data: rolePermissions, error: rolePermissionsError } = await supabase
      .from('role_permissions')
      .select('role, permission')

    if (rolePermissionsError) {
      throw rolePermissionsError
    }

    // Count unique roles
    const uniqueRoles = new Set(rolePermissions?.map(rp => rp.role) || [])

    // Count unique permissions
    const uniquePermissions = new Set(rolePermissions?.map(rp => rp.permission) || [])

    // Count unique categories (part before the dot in permission)
    const uniqueCategories = new Set(
      rolePermissions?.map(rp => rp.permission.split('.')[0]) || [],
    )

    // Count permissions by role
    const adminPermissions = rolePermissions?.filter(rp => rp.role === 'admin').length || 0
    const moderatorPermissions = rolePermissions?.filter(rp => rp.role === 'moderator').length || 0

    metrics.value = {
      totalRoles: uniqueRoles.size,
      totalPermissions: uniquePermissions.size,
      totalCategories: uniqueCategories.size,
      adminPermissions,
      moderatorPermissions,
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
      label="Total Permissions"
      :value="metrics.totalPermissions"
      icon="ph:key"
      variant="success"
      :is-loading="loading"
      description="Number of unique permissions available"
    />

    <KPICard
      label="Permission Categories"
      :value="metrics.totalCategories"
      icon="ph:folders"
      variant="warning"
      :is-loading="loading"
      description="Number of permission categories (e.g., users, events, etc.)"
    />

    <KPICard
      label="Admin Permissions"
      :value="metrics.adminPermissions"
      icon="ph:crown"
      variant="danger"
      :is-loading="loading"
      description="Number of permissions assigned to admin role"
    />

    <KPICard
      label="Moderator Permissions"
      :value="metrics.moderatorPermissions"
      icon="ph:gavel"
      variant="gray"
      :is-loading="loading"
      description="Number of permissions assigned to moderator role"
    />
  </KPIContainer>
</template>

<style scoped lang="scss">

</style>
