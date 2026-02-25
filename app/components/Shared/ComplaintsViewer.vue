<script setup lang="ts">
import type { Database } from '@/types/database.types'
import { Badge, Button, Card, Flex, Modal, Spinner, Tooltip } from '@dolanske/vui'
import { onMounted, ref, watch } from 'vue'
import { useBreakpoint } from '@/lib/mediaQuery'
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

// State
const complaints = ref<Complaint[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)
const expandedComplaints = ref<Set<number>>(new Set())
const deletingComplaints = ref<Set<number>>(new Set())
const showDeleteConfirm = ref(false)
const complaintToDelete = ref<number | null>(null)
const isBelowSmall = useBreakpoint('<xs')

// Get current user and supabase client
const user = useSupabaseUser()
const userId = useUserId()
const supabase = useSupabaseClient<Database>()

// Fetch user's complaints
async function fetchComplaints() {
  if (!user.value || !userId.value)
    return

  isLoading.value = true
  error.value = null

  try {
    const { data, error: fetchError } = await supabase
      .from('complaints')
      .select('*')
      .eq('created_by', userId.value)
      .order('created_at', { ascending: false })

    if (fetchError) {
      throw fetchError
    }

    complaints.value = data || []
  }
  catch (err: unknown) {
    console.error('Error fetching complaints:', err)
    error.value = 'Failed to load complaints'
  }
  finally {
    isLoading.value = false
  }
}

// Format date helper
function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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

  // Add to deleting set to show loading state
  deletingComplaints.value.add(complaintId)

  try {
    const { error: deleteError } = await supabase
      .from('complaints')
      .delete()
      .eq('id', complaintId)
      .eq('created_by', userId.value) // Ensure user can only delete their own complaints

    if (deleteError) {
      throw deleteError
    }

    // Remove from local state
    complaints.value = complaints.value.filter(c => c.id !== complaintId)

    // Remove from expanded set if it was expanded
    expandedComplaints.value.delete(complaintId)
  }
  catch (err: unknown) {
    console.error('Error deleting complaint:', err)
    error.value = 'Failed to delete complaint'
  }
  finally {
    deletingComplaints.value.delete(complaintId)
    // Reset modal state
    showDeleteConfirm.value = false
    complaintToDelete.value = null
  }
}

// Check if complaint is being deleted
function isDeleting(complaintId: number) {
  return deletingComplaints.value.has(complaintId)
}

// Handle modal close
function handleClose() {
  emit('close')
}

// Handle new complaint
function handleNewComplaint() {
  emit('newComplaint')
}

// Watch for modal open to fetch complaints
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    fetchComplaints()
    // Reset expanded state when modal opens
    expandedComplaints.value.clear()
  }
})

onMounted(() => {
  if (props.open) {
    fetchComplaints()
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

      <Card v-else-if="complaints.length === 0" class="card-bg">
        <Flex column gap="s" x-center y-center class="information-card">
          <p class="text-color-light">
            You haven't submitted any complaints yet.
          </p>
          <Button variant="accent" @click="handleNewComplaint">
            Submit a Complaint
          </Button>
        </Flex>
      </Card>

      <div v-else class="complaints-list">
        <Card
          v-for="complaint in complaints"
          :key="complaint.id"
          class="complaint-card"
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
                      Complaint made: {{ formatDate(complaint.created_at) }}
                    </p>
                  </template>
                  <span class="text-s">
                    {{ formatDate(complaint.response ? complaint.responded_at || complaint.created_at : complaint.created_at) }}
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
    </div>

    <template #footer>
      <Flex x-end y-center gap="s" expand>
        <Button
          v-if="complaints.length !== 0"
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

.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 2rem;
  text-align: center;
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
