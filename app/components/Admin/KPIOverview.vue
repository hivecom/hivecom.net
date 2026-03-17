<script setup lang="ts">
import { onBeforeMount, ref } from 'vue'
import { useMonthlyFunding } from '@/composables/useDataMonthlyFunding'
import KPICard from './KPICard.vue'
import KPIContainer from './KPIContainer.vue'

// Setup
const supabase = useSupabaseClient()
const { latestFunding } = useMonthlyFunding()
const loading = ref(true)

// State
const newUsersCount = ref(0)
const pendingComplaintsCount = ref(0)
const monthlyExpenses = ref(0)
const monthlyDonations = ref(0)
const upcomingEventsCount = ref(0)

// Get current date and 30 days ago for new users calculation
const now = new Date()
const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000))

// Fetch all KPI data
async function fetchKPIData() {
  loading.value = true

  try {
    // Fetch new users (30 days)
    const { data: newUsers } = await supabase
      .from('profiles')
      .select('id')
      .gte('created_at', thirtyDaysAgo.toISOString())

    newUsersCount.value = newUsers?.length || 0

    // Fetch pending complaints (not acknowledged AND no response)
    const { data: complaints } = await supabase
      .from('complaints')
      .select('id')
      .eq('acknowledged', false)
      .is('response', null)

    pendingComplaintsCount.value = complaints?.length || 0

    // Fetch current active expenses (started and not ended)
    const { data: expenses } = await supabase
      .from('expenses')
      .select('amount_cents')
      .is('ended_at', null)
      .lte('started_at', now.toISOString())

    monthlyExpenses.value = expenses?.reduce((sum, expense) => sum + expense.amount_cents, 0) || 0

    // monthly_funding served from shared cache via useMonthlyFunding
    monthlyDonations.value = latestFunding.value
      ? (latestFunding.value.donation_month_amount_cents || 0) + (latestFunding.value.patreon_month_amount_cents || 0)
      : 0

    // Fetch upcoming events
    const { data: events } = await supabase
      .from('events')
      .select('id')
      .gte('date', now.toISOString())

    upcomingEventsCount.value = events?.length || 0
  }
  catch (error) {
    console.error('Error fetching KPI data:', error)
  }
  finally {
    loading.value = false
  }
}

// Format currency
function formatCurrency(cents: number) {
  return `€${Math.round(cents / 100)}`
}

// Load data on mount
onBeforeMount(() => {
  fetchKPIData()
})
</script>

<template>
  <KPIContainer>
    <KPICard
      label="New Users"
      :value="newUsersCount"
      :is-loading="loading"
      icon="ph:user-plus"
      variant="success"
      description="Users who joined in the last 30 days"
    />

    <KPICard
      label="Pending Complaints"
      :value="pendingComplaintsCount"
      :is-loading="loading"
      icon="ph:warning-circle"
      :variant="pendingComplaintsCount > 1 ? 'danger' : 'warning'"
      description="Complaints that haven't been acknowledged yet"
    />

    <KPICard
      label="Active Expenses"
      :value="formatCurrency(monthlyExpenses)"
      :is-loading="loading"
      icon="ph:arrow-up-right"
      variant="danger"
      description="Total current active recurring expenses"
    />

    <KPICard
      label="Monthly Donations"
      :value="formatCurrency(monthlyDonations)"
      :is-loading="loading"
      icon="ph:arrow-down-left"
      variant="success"
      description="Total donations and Patreon income for current month"
    />

    <KPICard
      label="Upcoming Events"
      :value="upcomingEventsCount"
      :is-loading="loading"
      icon="ph:calendar-plus"
      :variant="upcomingEventsCount === 0 ? 'warning' : 'success'"
      description="Events scheduled for the future"
    />
  </KPIContainer>
</template>
