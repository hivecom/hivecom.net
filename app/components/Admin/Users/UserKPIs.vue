<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'

import KPICard from '../KPICard.vue'

const refreshSignal = defineModel<number>('refreshSignal')

// User metrics
const metrics = ref({
  active: 0,
  banned: 0,
  supporters: 0,
  lifetimeSupporters: 0,
  admins: 0,
  moderators: 0,
  total: 0,
})

// Data fetch state
const loading = ref(true)
const errorMessage = ref('')

// Get Supabase client
const supabase = useSupabaseClient()

// Fetch user metrics
async function fetchUserMetrics() {
  loading.value = true
  errorMessage.value = ''

  try {
    // Query for all users with their auth status
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select(`
        id,
        username,
        supporter_patreon,
        supporter_lifetime,
        patreon_id
      `)

    if (profilesError) {
      throw profilesError
    }

    // Query for user roles
    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id, role')

    if (rolesError) {
      throw rolesError
    }

    // Query for banned users from auth
    // Note: We'll implement ban status checking later through proper admin API integration
    // const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers()
    // if (authError) {
    //   throw authError
    // }

    // Reset metrics
    const newMetrics = {
      active: 0,
      banned: 0,
      supporters: 0,
      lifetimeSupporters: 0,
      admins: 0,
      moderators: 0,
      total: profiles ? profiles.length : 0,
    }

    // Create role mapping for easy lookup
    const roleMap = new Map<string, string[]>()
    userRoles?.forEach((userRole) => {
      if (!roleMap.has(userRole.user_id)) {
        roleMap.set(userRole.user_id, [])
      }
      roleMap.get(userRole.user_id)!.push(userRole.role)
    })

    // Create banned users set for easy lookup
    // Note: We need to properly check ban status through the admin API
    // For now, we'll assume no users are banned until we implement proper ban checking
    const bannedUserIds = new Set<string>()

    // Calculate metrics
    profiles?.forEach((profile) => {
      const userRoles = roleMap.get(profile.id) || []
      const isBanned = bannedUserIds.has(profile.id)

      if (isBanned) {
        newMetrics.banned++
      }
      else {
        newMetrics.active++
      }

      if (profile.supporter_patreon || profile.patreon_id) {
        newMetrics.supporters++
      }

      if (profile.supporter_lifetime) {
        newMetrics.lifetimeSupporters++
      }

      if (userRoles.includes('admin')) {
        newMetrics.admins++
      }

      if (userRoles.includes('moderator')) {
        newMetrics.moderators++
      }
    })

    metrics.value = newMetrics
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to fetch user metrics'
  }
  finally {
    loading.value = false
  }
}

// Compute total staff members (admins + moderators)
const staffMembers = computed(() => {
  return metrics.value.admins + metrics.value.moderators
})

// Watch for refresh signal from parent
watch(() => refreshSignal.value, () => {
  fetchUserMetrics()
})

// Fetch data on component mount
onBeforeMount(fetchUserMetrics)
</script>

<template>
  <Flex gap="m" class="kpi-container" expand>
    <KPICard
      label="Active Users"
      :value="metrics.active"
      icon="ph:user-check"
      variant="success"
      :is-loading="loading"
    />

    <KPICard
      label="Banned Users"
      :value="metrics.banned"
      icon="ph:user-minus"
      variant="danger"
      :is-loading="loading"
    />

    <KPICard
      label="Supporters"
      :value="metrics.supporters"
      icon="ph:heart"
      variant="primary"
      :is-loading="loading"
    />

    <KPICard
      label="Staff Members"
      :value="staffMembers"
      icon="ph:shield-check"
      variant="warning"
      :description="`${metrics.admins} admins, ${metrics.moderators} moderators`"
      :is-loading="loading"
    />
  </Flex>
</template>

<style scoped lang="scss">

</style>
