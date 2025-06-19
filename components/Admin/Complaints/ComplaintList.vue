<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'
import type { Tables, TablesUpdate } from '@/types/database.types'
import { Alert, Button, Card, Flex, Grid, Skeleton } from '@dolanske/vui'
import { computed, onMounted, ref, watch } from 'vue'
import ComplaintCard from './ComplaintCard.vue'
import ComplaintDetails from './ComplaintDetails.vue'
import ComplaintFilters from './ComplaintFilters.vue'

// Interface for Select options
interface SelectOption {
  label: string
  value: string
}

// Props
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

// Setup Supabase client
const supabase = useSupabaseClient()
const user = useSupabaseUser()

// Complaint query
const complaintsQuery = supabase
  .from('complaints')
  .select(`
    id,
    created_at,
    created_by,
    message,
    acknowledged,
    responded_at,
    responded_by,
    response,
    context_user,
    context_gameserver
  `)
  .order('created_at', { ascending: false })

// Data states
const loading = ref(true)
const complaints = ref<QueryData<typeof complaintsQuery>>([])
const errorMessage = ref('')

// Filter states
const search = ref('')
const statusFilter = ref<SelectOption[]>([])

// Detail states
const selectedComplaint = ref<Tables<'complaints'> | null>(null)
const showComplaintDetails = ref(false)

// Action loading states
const actionLoading = ref<Record<number, boolean>>({})

// Pagination
const itemsPerPage = 12
const currentPage = ref(1)

// Computed filtered complaints
const filteredComplaints = computed(() => {
  let filtered = complaints.value

  // Apply search filter
  if (search.value) {
    const searchLower = search.value.toLowerCase()
    filtered = filtered.filter(complaint =>
      complaint.message.toLowerCase().includes(searchLower),
    )
  }

  // Apply status filter
  if (statusFilter.value.length > 0) {
    filtered = filtered.filter((complaint) => {
      const status = getComplaintStatus(complaint)
      return statusFilter.value.some(filter => filter.value === status)
    })
  }

  return filtered
})

// Paginated complaints
const paginatedComplaints = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage
  const end = start + itemsPerPage
  return filteredComplaints.value.slice(start, end)
})

// Pagination info
const totalPages = computed(() =>
  Math.ceil(filteredComplaints.value.length / itemsPerPage),
)

// Helper function to get complaint status
function getComplaintStatus(complaint: Tables<'complaints'>): string {
  if (complaint.response) {
    return 'responded'
  }
  if (complaint.acknowledged) {
    return 'acknowledged'
  }
  return 'new'
}

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
    errorMessage.value = 'Failed to load complaints'
  }
  finally {
    loading.value = false
  }
}

// Handle complaint selection
function handleComplaintSelect(complaint: Tables<'complaints'>) {
  selectedComplaint.value = complaint
  showComplaintDetails.value = true
}

// Handle acknowledge action
async function handleAcknowledge(complaintId: number) {
  if (!user.value)
    return

  try {
    actionLoading.value[complaintId] = true

    const updateData: TablesUpdate<'complaints'> = {
      acknowledged: true,
    }

    const { error } = await supabase
      .from('complaints')
      .update(updateData)
      .eq('id', complaintId)

    if (error) {
      throw error
    }

    // Update local data
    const complaint = complaints.value.find(c => c.id === complaintId)
    if (complaint) {
      complaint.acknowledged = true
    }

    // Update selected complaint if it's the same one
    if (selectedComplaint.value?.id === complaintId) {
      selectedComplaint.value.acknowledged = true
    }

    // Trigger refresh signal
    refreshSignal.value = Date.now()
  }
  catch (error) {
    console.error('Error acknowledging complaint:', error)
    // You might want to show a toast notification here
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

    const updateData: TablesUpdate<'complaints'> = {
      response: data.response,
      responded_at: new Date().toISOString(),
      responded_by: user.value.id,
      acknowledged: true, // Ensure it's acknowledged when responded
    }

    const { error } = await supabase
      .from('complaints')
      .update(updateData)
      .eq('id', data.id)

    if (error) {
      throw error
    }

    // Update local data
    const complaint = complaints.value.find(c => c.id === data.id)
    if (complaint) {
      complaint.response = data.response
      complaint.responded_at = updateData.responded_at!
      complaint.responded_by = updateData.responded_by!
      complaint.acknowledged = true
    }

    // Update selected complaint if it's the same one
    if (selectedComplaint.value?.id === data.id) {
      selectedComplaint.value.response = data.response
      selectedComplaint.value.responded_at = updateData.responded_at!
      selectedComplaint.value.responded_by = updateData.responded_by!
      selectedComplaint.value.acknowledged = true
    }

    // Trigger refresh signal
    refreshSignal.value = Date.now()
  }
  catch (error) {
    console.error('Error responding to complaint:', error)
    // You might want to show a toast notification here
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

    const updateData: TablesUpdate<'complaints'> = {
      response: data.response,
      responded_at: new Date().toISOString(),
      responded_by: user.value.id,
    }

    const { error } = await supabase
      .from('complaints')
      .update(updateData)
      .eq('id', data.id)

    if (error) {
      throw error
    }

    // Update local data
    const complaint = complaints.value.find(c => c.id === data.id)
    if (complaint) {
      complaint.response = data.response
      complaint.responded_at = updateData.responded_at!
      complaint.responded_by = updateData.responded_by!
    }

    // Update selected complaint if it's the same one
    if (selectedComplaint.value?.id === data.id) {
      selectedComplaint.value.response = data.response
      selectedComplaint.value.responded_at = updateData.responded_at!
      selectedComplaint.value.responded_by = updateData.responded_by!
    }

    // Trigger refresh signal
    refreshSignal.value = Date.now()
  }
  catch (error) {
    console.error('Error updating complaint response:', error)
    // You might want to show a toast notification here
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

    const updateData: TablesUpdate<'complaints'> = {
      response: null,
      responded_at: null,
      responded_by: null,
      // Keep acknowledged as true, so it reverts to "acknowledged" status
    }

    const { error } = await supabase
      .from('complaints')
      .update(updateData)
      .eq('id', complaintId)

    if (error) {
      throw error
    }

    // Update local data
    const complaint = complaints.value.find(c => c.id === complaintId)
    if (complaint) {
      complaint.response = null
      complaint.responded_at = null
      complaint.responded_by = null
      // Keep acknowledged as true
    }

    // Update selected complaint if it's the same one
    if (selectedComplaint.value?.id === complaintId) {
      selectedComplaint.value.response = null
      selectedComplaint.value.responded_at = null
      selectedComplaint.value.responded_by = null
      // Keep acknowledged as true
    }

    // Trigger refresh signal
    refreshSignal.value = Date.now()
  }
  catch (error) {
    console.error('Error removing complaint response:', error)
    // You might want to show a toast notification here
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

    if (error) {
      throw error
    }

    // Remove from local data
    const index = complaints.value.findIndex(c => c.id === complaintId)
    if (index !== -1) {
      complaints.value.splice(index, 1)
    }

    // Clear selected complaint if it's the deleted one
    if (selectedComplaint.value?.id === complaintId) {
      selectedComplaint.value = null
    }

    // Trigger refresh signal
    refreshSignal.value = Date.now()
  }
  catch (error) {
    console.error('Error deleting complaint:', error)
    // You might want to show a toast notification here
  }
  finally {
    actionLoading.value[complaintId] = false
  }
}

// Handle pagination
function handlePageChange(page: number) {
  currentPage.value = page
}

// Reset pagination when filters change
watch([search, statusFilter], () => {
  currentPage.value = 1
})

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
  <Flex column gap="l" expand>
    <!-- Filters -->
    <ComplaintFilters
      v-model:search="search"
      v-model:status-filter="statusFilter"
    />

    <!-- Loading skeleton -->
    <Grid v-if="loading" :columns="2" gap="m" expand>
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
    <Alert v-else-if="filteredComplaints.length === 0" variant="info">
      No complaints found
    </Alert>

    <!-- Complaints grid -->
    <Flex v-else column gap="l" expand>
      <Grid :columns="2" gap="m" class="complaints-grid" expand>
        <ComplaintCard
          v-for="complaint in paginatedComplaints"
          :key="complaint.id"
          :complaint="complaint"
          @select="handleComplaintSelect"
          @acknowledge="handleAcknowledge"
        />
      </Grid>

      <!-- Pagination -->
      <Flex v-if="totalPages > 1" x-center class="pagination-container">
        <div class="pagination-placeholder">
          <p class="text-s color-text-light">
            Showing {{ (currentPage - 1) * itemsPerPage + 1 }}-{{ Math.min(currentPage * itemsPerPage, filteredComplaints.length) }} of {{ filteredComplaints.length }} complaints
          </p>
          <div class="pagination-buttons">
            <Button
              v-if="currentPage > 1"
              variant="gray"
              size="s"
              @click="handlePageChange(currentPage - 1)"
            >
              Previous
            </Button>
            <span class="pagination-current text-s">
              Page {{ currentPage }} of {{ totalPages }}
            </span>
            <Button
              v-if="currentPage < totalPages"
              variant="gray"
              size="s"
              @click="handlePageChange(currentPage + 1)"
            >
              Next
            </Button>
          </div>
        </div>
      </Flex>
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
.pagination-container {
  margin-top: var(--space-l);
}

.pagination-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-s);
}

.pagination-buttons {
  display: flex;
  align-items: center;
  gap: var(--space-m);
}

.pagination-current {
  padding: var(--space-xs) var(--space-s);
  background-color: var(--color-bg-medium);
  border-radius: var(--border-radius-s);
}

.complaints-grid {
  align-items: stretch;
}
</style>
