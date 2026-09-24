<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import KPICard from '../KPICard.vue'
import KPIContainer from '../KPIContainer.vue'

const refreshSignal = defineModel<number>('refreshSignal')

const metrics = ref({
  active: 0,
  banned: 0,
  supporters: 0,
  lifetimeSupporters: 0,
  admins: 0,
  moderators: 0,
  total: 0,
})

const loading = ref(true)
const errorMessage = ref('')

const supabase = useSupabaseClient()

async function fetchUserMetrics() {
  loading.value = true
  errorMessage.value = ''

  try {
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

    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id, role')

    if (rolesError) {
      throw rolesError
    }

    const newMetrics = {
      active: 0,
      banned: 0,
      supporters: 0,
      lifetimeSupporters: 0,
      admins: 0,
      moderators: 0,
      total: profiles ? profiles.length : 0,
    }

    const roleMap = new Map<string, string[]>()
    userRoles?.forEach((userRole) => {
      if (!roleMap.has(userRole.user_id)) {
        roleMap.set(userRole.user_id, [])
      }
      roleMap.get(userRole.user_id)!.push(userRole.role)
    })

    // Ban status needs the admin API, so nobody counts as banned here yet.
    const bannedUserIds = new Set<string>()

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

const staffMembers = computed(() => {
  return metrics.value.admins + metrics.value.moderators
})

watch(() => refreshSignal.value, () => {
  fetchUserMetrics()
})

onBeforeMount(fetchUserMetrics)
</script>

<template>
  <KPIContainer>
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
      label="Staff Users"
      :value="staffMembers"
      icon="ph:shield-check"
      variant="warning"
      :description="`${metrics.admins} admins, ${metrics.moderators} moderators`"
      :is-loading="loading"
    />
  </KPIContainer>
</template>

<style scoped lang="scss">

</style>
