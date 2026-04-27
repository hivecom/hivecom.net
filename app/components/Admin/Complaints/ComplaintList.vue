<script setup lang="ts">
import type { Ref } from 'vue'
import type { Tables, TablesUpdate } from '@/types/database.overrides'
import { Alert, Card, Flex, Grid, paginate, Pagination, Skeleton } from '@dolanske/vui'
import { watchDebounced } from '@vueuse/core'
import { computed, inject, onBeforeMount, ref, watch } from 'vue'
import { useDataNotifications } from '@/composables/useDataNotifications'
import { useBreakpoint } from '@/lib/mediaQuery'
import { getRouteQueryString } from '@/lib/utils/common'
import ComplaintCard from './ComplaintCard.vue'
import ComplaintDetails from './ComplaintDetails.vue'
import ComplaintFilters from './ComplaintFilters.vue'

// Interface for Select options
interface SelectOption {
  label: string
  value: string
}

interface RpcComplaint {
  id: number
  created_at: string
  created_by: string
  message: string
  acknowledged: boolean
  responded_at: string | null
  responded_by: string | null
  response: string | null
  context_user: string | null
  context_gameserver: number | null
  context_discussion: string | null
  context_discussion_reply: string | null
  total_count: number
}

// Props
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })
const route = useRoute()
const router = useRouter()

// Setup Supabase client
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const userId = useUserId()

// Data states
const loading = ref(true)
const initialLoad = ref(true)
const complaints = ref<RpcComplaint[]>([])
const totalCount = ref(0)
const errorMessage = ref('')

// Filter states
const search = ref('')
const statusFilter = ref<SelectOption[]>([])
const contextFilter = ref<SelectOption[]>([])

// Detail states
const selectedComplaint = ref<Tables<'complaints'> | null>(null)
const showComplaintDetails = ref(false)

const focusedComplaintId = computed(() => {
  const complaintQuery = route.query.complaint
  const rawValue = getRouteQueryString(complaintQuery)
  const parsed = Number.parseInt(rawValue, 10)
  return Number.isNaN(parsed) ? null : parsed
})

// Action loading states
const actionLoading = ref<Record<number, boolean>>({})

const isBelowMedium = useBreakpoint('<m')

const adminTablePerPage = inject<Ref<number>>('adminTablePerPage', computed(() => 10))

const gridColumns = computed(() => {
  if (isBelowMedium.value)
    return 1

  return adminTablePerPage.value > 10 ? 3 : 2
})

// Pagination
const currentPage = ref(1)

const paginationState = computed(() =>
  paginate(totalCount.value, currentPage.value, adminTablePerPage.value),
)

const shouldShowPagination = computed(() =>
  totalCount.value > adminTablePerPage.value,
)

// Fetch complaints data via server-side paginated RPC
async function fetchComplaints() {
  try {
    loading.value = true
    errorMessage.value = ''

    const pStatus = (statusFilter.value ?? []).map(o => o.value)
    const pContext = (contextFilter.value ?? []).map(o => o.value)

    const { data, error } = await supabase.rpc('get_admin_complaints_paginated', {
      p_search: search.value,
      p_status: pStatus,
      p_context: pContext,
      p_limit: adminTablePerPage.value,
      p_offset: (currentPage.value - 1) * adminTablePerPage.value,
    })

    if (error)
      throw error

    const fetched = (data ?? []) as RpcComplaint[]
    complaints.value = fetched
    totalCount.value = fetched[0]?.total_count ?? 0
  }
  catch (error) {
    console.error('Error fetching complaints:', error)
    errorMessage.value = 'Failed to load complaints'
  }
  finally {
    initialLoad.value = false
    loading.value = false
  }
}

// Handle complaint selection
function handleComplaintSelect(complaint: Tables<'complaints'>) {
  selectedComplaint.value = complaint
  showComplaintDetails.value = true
}

function openComplaintById(complaintId: number | null): boolean {
  if (complaintId === null)
    return false

  const match = complaints.value.find(c => c.id === complaintId)

  if (!match)
    return false

  handleComplaintSelect(match as unknown as Tables<'complaints'>)
  return true
}

// Handle acknowledge action
const { fetch: fetchNotifications } = useDataNotifications()

async function handleAcknowledge(complaintId: number) {
  if (!user.value)
    return

  try {
    actionLoading.value[complaintId] = true

    const { error } = await supabase
      .from('complaints')
      .update({ acknowledged: true } satisfies TablesUpdate<'complaints'>)
      .eq('id', complaintId)

    if (error)
      throw error

    await fetchComplaints()
    refreshSignal.value = Date.now()
    void fetchNotifications()
  }
  catch (error) {
    console.error('Error acknowledging complaint:', error)
  }
  finally {
    actionLoading.value[complaintId] = false
  }
}

// Handle response action
async function handleRespond(data: { id: number, response: string }) {
  if (!user.value)
    return

  try {
    actionLoading.value[data.id] = true

    const { error } = await supabase
      .from('complaints')
      .update({
        response: data.response,
        responded_at: new Date().toISOString(),
        responded_by: userId.value,
        acknowledged: true,
      } satisfies TablesUpdate<'complaints'>)
      .eq('id', data.id)

    if (error)
      throw error

    await fetchComplaints()
    refreshSignal.value = Date.now()
  }
  catch (error) {
    console.error('Error responding to complaint:', error)
  }
  finally {
    actionLoading.value[data.id] = false
  }
}

// Handle update response action
async function handleUpdateResponse(data: { id: number, response: string }) {
  if (!user.value)
    return

  try {
    actionLoading.value[data.id] = true

    const { error } = await supabase
      .from('complaints')
      .update({
        response: data.response,
        responded_at: new Date().toISOString(),
        responded_by: userId.value,
      } satisfies TablesUpdate<'complaints'>)
      .eq('id', data.id)

    if (error)
      throw error

    await fetchComplaints()
    refreshSignal.value = Date.now()
  }
  catch (error) {
    console.error('Error updating complaint response:', error)
  }
  finally {
    actionLoading.value[data.id] = false
  }
}

// Handle remove response action
async function handleRemoveResponse(complaintId: number) {
  if (!user.value)
    return

  try {
    actionLoading.value[complaintId] = true

    const { error } = await supabase
      .from('complaints')
      .update({
        response: null,
        responded_at: null,
        responded_by: null,
        // Keep acknowledged as true, so it reverts to "acknowledged" status
      } satisfies TablesUpdate<'complaints'>)
      .eq('id', complaintId)

    if (error)
      throw error

    await fetchComplaints()
    refreshSignal.value = Date.now()
  }
  catch (error) {
    console.error('Error removing complaint response:', error)
  }
  finally {
    actionLoading.value[complaintId] = false
  }
}

// Handle delete complaint action
async function handleDeleteComplaint(complaintId: number) {
  if (!user.value)
    return

  try {
    actionLoading.value[complaintId] = true

    const { error } = await supabase
      .from('complaints')
      .delete()
      .eq('id', complaintId)

    if (error)
      throw error

    if (selectedComplaint.value?.id === complaintId)
      selectedComplaint.value = null

    await fetchComplaints()
    refreshSignal.value = Date.now()
  }
  catch (error) {
    console.error('Error deleting complaint:', error)
  }
  finally {
    actionLoading.value[complaintId] = false
  }
}

// Sync complaint query params with details sheet state
watch(showComplaintDetails, (isOpen) => {
  if (isOpen && selectedComplaint.value) {
    const nextQuery = {
      ...route.query,
      complaint: selectedComplaint.value.id,
    }
    router.replace({ query: nextQuery })
    return
  }
  if (isOpen)
    return
  if (!route.query.complaint)
    return
  const { complaint, ...rest } = route.query
  router.replace({ query: rest })
})

watch(
  () => [focusedComplaintId.value, loading.value] as const,
  ([complaintId, isLoading]) => {
    if (isLoading)
      return
    if (complaintId === null)
      return
    openComplaintById(complaintId)
  },
  { immediate: true },
)

function handlePageChange(page: number) {
  currentPage.value = page
}

// Search: debounced fetch
watchDebounced(search, () => {
  currentPage.value = 1
  void fetchComplaints()
}, { debounce: 300 })

// Status + context filters: immediate fetch
watch([statusFilter, contextFilter], () => {
  currentPage.value = 1
  void fetchComplaints()
}, { deep: true })

// Page: fetch on change
watch(currentPage, () => {
  void fetchComplaints()
})

// Per-page: reset and fetch
watch(adminTablePerPage, () => {
  if (currentPage.value !== 1) {
    currentPage.value = 1
    // currentPage watch fires fetch
  }
  else {
    void fetchComplaints()
  }
})

// Refresh signal from KPIs or external actions
watch(() => refreshSignal.value, (val) => {
  if (val > 0)
    void fetchComplaints()
})

// Initial data fetch
onBeforeMount(() => void fetchComplaints())
</script>

<template>
  <Flex column gap="l" expand>
    <!-- Filters -->
    <ComplaintFilters
      v-model:search="search"
      v-model:status-filter="statusFilter"
      v-model:context-filter="contextFilter"
    />

    <!-- Loading skeleton (initial load only) -->
    <Grid v-if="initialLoad" :columns="gridColumns" gap="m" expand>
      <Card v-for="i in 6" :key="i" separators>
        <template #header>
          <Flex x-between y-center expand>
            <Skeleton :width="120" :height="20" :radius="4" />
            <Skeleton :width="80" :height="16" :radius="12" />
          </Flex>
        </template>

        <Flex column gap="m">
          <Skeleton :height="16" :width="100" :radius="4" />
          <Skeleton :height="60" :radius="4" />
          <Flex x-between y-center>
            <Skeleton :width="80" :height="14" :radius="4" />
            <Skeleton :width="100" :height="14" :radius="4" />
          </Flex>
        </Flex>
      </Card>
    </Grid>

    <!-- Error message -->
    <Alert v-else-if="errorMessage" variant="danger">
      {{ errorMessage }}
    </Alert>

    <!-- No complaints message -->
    <Alert v-else-if="!loading && complaints.length === 0" variant="info">
      No complaints found
    </Alert>

    <!-- Complaints grid -->
    <Flex v-else column gap="l" expand>
      <div class="complaints-loading-wrapper" :class="{ 'complaints-loading': loading && !initialLoad }">
        <Grid :columns="gridColumns" gap="m" class="complaints-grid" expand>
          <ComplaintCard
            v-for="complaint in complaints"
            :key="complaint.id"
            :complaint="(complaint as unknown as Tables<'complaints'>)"
            @select="handleComplaintSelect"
            @acknowledge="handleAcknowledge"
          />
        </Grid>
      </div>

      <!-- Pagination -->
      <Pagination
        v-if="shouldShowPagination"
        :pagination="paginationState"
        @change="handlePageChange"
      />
    </Flex>

    <!-- Complaint Details -->
    <ComplaintDetails
      v-model:is-open="showComplaintDetails"
      :complaint="selectedComplaint"
      @acknowledge="handleAcknowledge"
      @respond="handleRespond"
      @update-response="handleUpdateResponse"
      @remove-response="handleRemoveResponse"
      @delete-complaint="handleDeleteComplaint"
      @close="selectedComplaint = null"
    />
  </Flex>
</template>

<style scoped lang="scss">
.complaints-loading-wrapper {
  width: 100%;
  transition: opacity var(--transition-slow);
}

.complaints-loading {
  opacity: 0.4;
  pointer-events: none;
}

.complaints-grid {
  align-items: stretch;
}
</style>
