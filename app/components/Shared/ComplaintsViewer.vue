<script setup lang="ts">
import type { Database } from '@/types/database.types'
import { Badge, Button, Card, Flex, Modal, paginate, Pagination, Spinner, Tooltip } from '@dolanske/vui'
import { computed, onMounted, ref, watch } from 'vue'
import { useBreakpoint } from '@/lib/mediaQuery'
import { formatDateWithTime } from '@/lib/utils/date'
import ConfirmModal from './ConfirmModal.vue'
import GameServerLink from './GameServerLink.vue'
import UserDisplay from './UserDisplay.vue'
import UserLink from './UserLink.vue'

type Complaint = Database['public']['Tables']['complaints']['Row']

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'newComplaint'): void
}>()

const PAGE_SIZE = 5

// State
const complaints = ref<Complaint[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)
const deletingComplaints = ref<Set<number>>(new Set())
const showDeleteConfirm = ref(false)
const complaintToDelete = ref<number | null>(null)
const isBelowSmall = useBreakpoint('<xs')

// Pagination
const currentPage = ref(1)
const totalCount = ref(0)

const paginationState = computed(() =>
  paginate(totalCount.value, currentPage.value, PAGE_SIZE),
)

const shouldShowPagination = computed(() =>
  totalCount.value > PAGE_SIZE,
)

// Get current user and supabase client
const user = useSupabaseUser()
const userId = useUserId()
const supabase = useSupabaseClient<Database>()

// Fetch user's complaints for the current page
async function fetchComplaints() {
  if (!user.value || !userId.value)
    return

  isLoading.value = true
  error.value = null

  const from = (currentPage.value - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  try {
    const { data, error: fetchError, count } = await supabase
      .from('complaints')
      .select('*', { count: 'exact' })
      .eq('created_by', userId.value)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (fetchError) {
      throw fetchError
    }

    complaints.value = data ?? []
    totalCount.value = count ?? 0
  }
  catch (err: unknown) {
    console.error('Error fetching complaints:', err)
    error.value = 'Failed to load complaints'
  }
  finally {
    isLoading.value = false
  }
}

// Get status badge variant
function getStatusVariant(complaint: Complaint) {
  if (complaint.response)
    return 'success'
  if (complaint.acknowledged)
    return 'info'
  return 'neutral'
}

// Get status text
function getStatusText(complaint: Complaint) {
  if (complaint.response)
    return 'Responded'
  if (complaint.acknowledged)
    return 'Acknowledged'
  return 'Pending Review'
}

// Delete complaint - show confirmation modal
function showDeleteConfirmation(complaintId: number) {
  complaintToDelete.value = complaintId
  showDeleteConfirm.value = true
}

// Actually delete the complaint after confirmation
async function deleteComplaint() {
  if (!user.value || !userId.value || !complaintToDelete.value)
    return

  const complaintId = complaintToDelete.value

  deletingComplaints.value.add(complaintId)

  try {
    const { error: deleteError } = await supabase
      .from('complaints')
      .delete()
      .eq('id', complaintId)
      .eq('created_by', userId.value)

    if (deleteError) {
      throw deleteError
    }

    // If we just deleted the last item on a page that is not page 1, go back one page
    const isLastItemOnPage = complaints.value.length === 1 && currentPage.value > 1
    if (isLastItemOnPage) {
      currentPage.value -= 1
    }
    else {
      await fetchComplaints()
    }
  }
  catch (err: unknown) {
    console.error('Error deleting complaint:', err)
    error.value = 'Failed to delete complaint'
  }
  finally {
    deletingComplaints.value.delete(complaintId)
    showDeleteConfirm.value = false
    complaintToDelete.value = null
  }
}

function isDeleting(complaintId: number) {
  return deletingComplaints.value.has(complaintId)
}

function handleClose() {
  emit('close')
}

function handleNewComplaint() {
  emit('newComplaint')
}

function handlePageChange(page: number) {
  currentPage.value = page
}

// Re-fetch when page changes
watch(currentPage, () => {
  void fetchComplaints()
})

// Watch for modal open to fetch complaints and reset state
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    currentPage.value = 1
    void fetchComplaints()
  }
})

onMounted(() => {
  if (props.open) {
    void fetchComplaints()
  }
})
</script>

<template>
  <Modal :open="open" :size="isBelowSmall ? 'screen' : undefined" :card="{ footerSeparator: true }" @close="handleClose">
    <template #header>
      <h3>Your Complaints</h3>
    </template>

    <div class="complaints-viewer">
      <Card v-if="isLoading" class="card-bg">
        <Flex column gap="s" x-center y-center class="information-card">
          <Spinner size="m" />
        </Flex>
      </Card>

      <Card v-else-if="error" class="card-bg">
        <Flex column gap="s" x-center y-center class="information-card">
          <p class="text-color-error">
            {{ error }}
          </p>
          <Button variant="gray" @click="fetchComplaints">
            Try Again
          </Button>
        </Flex>
      </Card>

      <Card v-else-if="totalCount === 0" class="card-bg">
        <Flex column gap="s" x-center y-center class="information-card">
          <p class="text-color-light">
            You haven't submitted any complaints yet.
          </p>
          <Button variant="accent" @click="handleNewComplaint">
            Submit a Complaint
          </Button>
        </Flex>
      </Card>

      <Flex v-else column gap="m">
        <div class="complaints-list">
          <Card
            v-for="complaint in complaints"
            :key="complaint.id"
            class="card-bg"
            :class="{ 'complaint-card--deleting': isDeleting(complaint.id) }"
          >
            <Flex column gap="s" expand>
              <!-- Header with responded_by user or status, and date with delete button -->
              <Flex x-between y-center expand>
                <div>
                  <UserDisplay
                    v-if="complaint.response && complaint.responded_by"
                    :user-id="complaint.responded_by"
                    show-role
                  />
                  <Badge v-else :variant="getStatusVariant(complaint)">
                    {{ getStatusText(complaint) }}
                  </Badge>
                </div>
                <Flex y-center gap="xs">
                  <Icon name="ph:clock" size="12" />
                  <Tooltip>
                    <template #tooltip>
                      <p class="text-xs">
                        Complaint made: {{ formatDateWithTime(complaint.created_at) }}
                      </p>
                    </template>
                    <span class="text-s">
                      {{ formatDateWithTime(complaint.response ? complaint.responded_at || complaint.created_at : complaint.created_at) }}
                    </span>
                  </Tooltip>
                  <Button
                    size="s"
                    variant="danger"
                    :disabled="isDeleting(complaint.id)"
                    :loading="isDeleting(complaint.id)"
                    aria-label="Delete complaint"
                    @click="showDeleteConfirmation(complaint.id)"
                  >
                    <Icon name="ph:trash" />
                  </Button>
                </Flex>
              </Flex>

              <!-- Response (shown by default if exists) -->
              <div v-if="complaint.response">
                <p class="text-s">
                  {{ complaint.response }}
                </p>
              </div>

              <!-- Original complaint message (always shown) -->
              <div>
                <p class="text-color-light text-s quote quote-border">
                  {{ complaint.message }}
                </p>
              </div>

              <!-- Context information -->
              <div v-if="complaint.context_user || complaint.context_gameserver">
                <Flex gap="m" wrap>
                  <div v-if="complaint.context_user">
                    <Flex gap="xs" y-center>
                      <Icon name="ph:user" class="text-color-light" size="14" />
                      <span class="text-s text-color-light">Related User:</span>
                      <UserLink class="text-s" :user-id="complaint.context_user" />
                    </Flex>
                  </div>
                  <div v-if="complaint.context_gameserver">
                    <Flex gap="xs" y-center>
                      <Icon name="ph:game-controller" class="text-color-light" size="14" />
                      <span class="text-s text-color-light">Related Game Server:</span>
                      <GameServerLink :gameserver-id="complaint.context_gameserver" />
                    </Flex>
                  </div>
                </Flex>
              </div>
            </Flex>
          </Card>
        </div>

        <!-- Pagination -->
        <Pagination
          v-if="shouldShowPagination"
          :pagination="paginationState"
          @change="handlePageChange"
        />
      </Flex>
    </div>

    <template #footer>
      <Flex x-end y-center gap="s" expand>
        <Button
          v-if="totalCount > 0"
          variant="accent"
          :expand="isBelowSmall"
          @click="handleNewComplaint"
        >
          New Complaint
        </Button>
        <Button variant="gray" :expand="isBelowSmall" @click="handleClose">
          Close
        </Button>
      </Flex>
    </template>
  </Modal>

  <!-- Delete Confirmation Modal -->
  <ConfirmModal
    v-model:open="showDeleteConfirm"
    :confirm="deleteComplaint"
    title="Delete Complaint"
    description="Are you sure you want to delete this complaint? This action cannot be undone."
    confirm-text="Delete"
    cancel-text="Cancel"
    :destructive="true"
  />
</template>

<style scoped lang="scss">
.complaints-viewer {
  max-height: 70vh;
  overflow-y: auto;
}

.information-card {
  min-height: 108px;
}

.complaints-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.complaint-card--deleting {
  opacity: 0.5;
  pointer-events: none;
}

.quote-border {
  border-left: 3px solid var(--color-text-lighter);
  padding-left: 12px;
}
</style>
