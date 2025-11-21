<script setup lang="ts">
import { ref, watch } from 'vue'

import KPICard from '../KPICard.vue'
import KPIContainer from '../KPIContainer.vue'

const refreshSignal = defineModel<number>('refreshSignal')

// Announcement metrics
const metrics = ref({
  totalAnnouncements: 0,
  pinnedAnnouncements: 0,
  recentAnnouncements: 0,
})

// Data fetch state
const loading = ref(true)
const errorMessage = ref('')

// Get Supabase client
const supabase = useSupabaseClient()

// Fetch announcement metrics
async function fetchAnnouncementMetrics() {
  loading.value = true
  errorMessage.value = ''

  try {
    // Get all announcements
    const { data: announcements, error } = await supabase
      .from('announcements')
      .select('*')

    if (error) {
      throw error
    }

    if (!announcements) {
      throw new Error('No announcements data received')
    }

    // Calculate metrics
    const totalAnnouncements = announcements.length
    const pinnedAnnouncements = announcements.filter(a => a.pinned).length

    // Recent announcements (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const recentAnnouncements = announcements.filter(a =>
      new Date(a.created_at) >= thirtyDaysAgo,
    ).length

    metrics.value = {
      totalAnnouncements,
      pinnedAnnouncements,
      recentAnnouncements,
    }
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to fetch announcement metrics'
  }
  finally {
    loading.value = false
  }
}

// Watch for refresh signal from parent
watch(() => refreshSignal.value, () => {
  fetchAnnouncementMetrics()
})

// Fetch data on component mount
onBeforeMount(fetchAnnouncementMetrics)
</script>

<template>
  <KPIContainer>
    <KPICard
      label="Total Announcements"
      :value="metrics.totalAnnouncements"
      icon="ph:megaphone"
      variant="primary"
      :is-loading="loading"
    />

    <KPICard
      label="Pinned Announcements"
      :value="metrics.pinnedAnnouncements"
      icon="ph:push-pin"
      variant="warning"
      :is-loading="loading"
    />

    <KPICard
      label="Recent (30 days)"
      :value="metrics.recentAnnouncements"
      icon="ph:clock"
      variant="success"
      :is-loading="loading"
    />
  </KPIContainer>
</template>

<style scoped lang="scss">

</style>
