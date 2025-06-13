<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'
import { Grid } from '@dolanske/vui'
import { computed, onMounted, ref, watch } from 'vue'
import KPICard from '@/components/Admin/KPICard.vue'

// Props for refresh signal
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

// Setup Supabase client
const supabase = useSupabaseClient()

// Complaint query
const complaintsQuery = supabase
  .from('complaints')
  .select(`
    id,
    created_at,
    acknowledged,
    responded_at,
    response
  `)

// Data states
const loading = ref(true)
const complaints = ref<QueryData<typeof complaintsQuery>>([])
const errorMessage = ref('')

// Computed KPI values
const totalComplaints = computed(() => complaints.value.length)

const pendingComplaints = computed(() =>
  complaints.value.filter(complaint => !complaint.acknowledged && complaint.response === null).length,
)

const acknowledgedComplaints = computed(() =>
  complaints.value.filter(complaint =>
    complaint.acknowledged && !complaint.response,
  ).length,
)

const respondedComplaints = computed(() =>
  complaints.value.filter(complaint => complaint.response !== null).length,
)

const recentComplaints = computed(() => {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  return complaints.value.filter(complaint =>
    new Date(complaint.created_at) >= thirtyDaysAgo,
  ).length
})

// Fetch complaints data
async function fetchComplaints() {
  try {
    loading.value = true
    errorMessage.value = ''

    const { data, error } = await complaintsQuery

    if (error) {
      throw error
    }

    complaints.value = data || []
  }
  catch (error) {
    console.error('Error fetching complaints:', error)
    errorMessage.value = 'Failed to load complaints data'
  }
  finally {
    loading.value = false
  }
}

// Watch for refresh signal changes
watch(() => refreshSignal.value, () => {
  if (refreshSignal.value > 0) {
    fetchComplaints()
  }
})

// Initial data fetch
onMounted(fetchComplaints)
</script>

<template>
  <Grid :columns="5" gap="m" class="kpi-container" expand>
    <KPICard
      label="Total Complaints"
      :value="totalComplaints"
      :is-loading="loading"
      icon="ph:chat-circle"
      variant="primary"
      description="All complaints ever submitted"
    />

    <KPICard
      label="Pending"
      :value="pendingComplaints"
      :is-loading="loading"
      icon="ph:bell"
      variant="warning"
      description="Complaints awaiting acknowledgment or response"
    />

    <KPICard
      label="Acknowledged"
      :value="acknowledgedComplaints"
      :is-loading="loading"
      icon="ph:check-circle"
      variant="primary"
      description="Acknowledged but not yet responded to"
    />

    <KPICard
      label="Responded"
      :value="respondedComplaints"
      :is-loading="loading"
      icon="ph:chat-circle-dots"
      variant="success"
      description="Complaints with admin responses"
    />

    <KPICard
      label="Recent (30d)"
      :value="recentComplaints"
      :is-loading="loading"
      icon="ph:calendar"
      variant="gray"
      description="Complaints submitted in the last 30 days"
    />
  </Grid>
</template>
