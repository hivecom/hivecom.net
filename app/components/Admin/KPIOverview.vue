<script setup lang="ts">
import { onBeforeMount } from 'vue'
import { useDataAdminKPIs } from '@/composables/useDataAdminKPIs'
import KPICard from './KPICard.vue'
import KPIContainer from './KPIContainer.vue'

const {
  loading,
  newUsersCount,
  pendingComplaintsCount,
  monthlyExpenses,
  monthlyDonations,
  upcomingEventsCount,
  fetchKPIData,
} = useDataAdminKPIs()

function formatCurrency(cents: number) {
  return `€${Math.round(cents / 100)}`
}

onBeforeMount(() => {
  fetchKPIData()
})
</script>

<template>
  <KPIContainer>
    <KPICard
      to="/admin/users"
      label="New Users"
      :value="newUsersCount"
      :is-loading="loading"
      icon="ph:user-plus"
      variant="success"
      description="Users who joined in the last 30 days"
    />

    <KPICard
      to="/admin/complaints"
      label="Pending Complaints"
      :value="pendingComplaintsCount"
      :is-loading="loading"
      icon="ph:warning-circle"
      :variant="pendingComplaintsCount > 1 ? 'danger' : 'warning'"
      description="Complaints that haven't been acknowledged yet"
    />

    <KPICard
      to="/admin/funding"
      label="Active Expenses"
      :value="formatCurrency(monthlyExpenses)"
      :is-loading="loading"
      icon="ph:arrow-up-right"
      variant="danger"
      description="Total current active recurring expenses"
    />

    <KPICard
      to="/admin/funding"
      label="Monthly Donations"
      :value="formatCurrency(monthlyDonations)"
      :is-loading="loading"
      icon="ph:arrow-down-left"
      variant="success"
      description="Total donations and Patreon income for current month"
    />

    <KPICard
      to="/admin/events"
      label="Upcoming Official One-off Events"
      :value="upcomingEventsCount"
      :is-loading="loading"
      icon="ph:calendar-plus"
      :variant="upcomingEventsCount === 0 ? 'warning' : 'success'"
      description="Events scheduled for the future"
    />
  </KPIContainer>
</template>
