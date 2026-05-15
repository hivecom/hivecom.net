import type { Database } from '@/types/database.types'
import { onBeforeMount, ref } from 'vue'
import { useDataMonthlyFunding } from '@/composables/useDataMonthlyFunding'

export function useDataAdminKPIs() {
  const supabase = useSupabaseClient<Database>()
  const { latestFunding } = useDataMonthlyFunding()

  const loading = ref(true)
  const newUsersCount = ref(0)
  const pendingComplaintsCount = ref(0)
  const monthlyExpenses = ref(0)
  const monthlyDonations = ref(0)
  const upcomingEventsCount = ref(0)
  const inaccessibleServersCount = ref(0)

  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000))

  async function fetchKPIData() {
    loading.value = true

    try {
      const { data: newUsers } = await supabase
        .from('profiles')
        .select('id')
        .gte('created_at', thirtyDaysAgo.toISOString())

      newUsersCount.value = newUsers?.length ?? 0

      const { data: complaints } = await supabase
        .from('complaints')
        .select('id')
        .eq('acknowledged', false)
        .is('response', null)

      pendingComplaintsCount.value = complaints?.length ?? 0

      const { data: expenses } = await supabase
        .from('funding_expenses')
        .select('amount_cents')
        .is('ended_at', null)
        .lte('started_at', now.toISOString())

      monthlyExpenses.value = expenses?.reduce((sum, e) => sum + (e.amount_cents), 0) ?? 0

      monthlyDonations.value = latestFunding.value
        ? (latestFunding.value.donation_month_amount_cents ?? 0) + (latestFunding.value.patreon_month_amount_cents ?? 0)
        : 0

      const { data: events } = await supabase
        .from('events')
        .select('id')
        .gte('date', now.toISOString())

      upcomingEventsCount.value = events?.length ?? 0

      const { data: inaccessibleServers } = await supabase
        .from('network_servers')
        .select('id')
        .eq('docker_control', true)
        .eq('accessible', false)

      inaccessibleServersCount.value = inaccessibleServers?.length ?? 0
    }
    catch (error) {
      console.error('Error fetching KPI data:', error)
    }
    finally {
      loading.value = false
    }
  }

  onBeforeMount(() => {
    void fetchKPIData()
  })

  return {
    loading,
    newUsersCount,
    pendingComplaintsCount,
    monthlyExpenses,
    monthlyDonations,
    upcomingEventsCount,
    inaccessibleServersCount,
    fetchKPIData,
  }
}
