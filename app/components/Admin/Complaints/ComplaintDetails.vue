<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Badge, Button, Card, Flex, Sheet, Textarea } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import GameServerLink from '@/components/Shared/GameServerLink.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
import UserLink from '@/components/Shared/UserLink.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{
  complaint: Tables<'complaints'> | null
}>()

const emit = defineEmits<{
  (e: 'acknowledge', id: number): void
  (e: 'respond', data: { id: number, response: string }): void
  (e: 'updateResponse', data: { id: number, response: string }): void
  (e: 'removeResponse', id: number): void
  (e: 'deleteComplaint', id: number): void
  (e: 'close'): void
}>()

// Get admin permissions
const { canDeleteComplaints } = useAdminPermissions()

const isMobile = useBreakpoint('<xs')
const showActionLabels = computed(() => !isMobile.value)

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// Response form state
const responseText = ref('')
const isSubmitting = ref(false)
const isEditingResponse = ref(false)
const showRemoveConfirm = ref(false)
const showDeleteConfirm = ref(false)

// Computed properties
const status = computed(() => {
  if (!props.complaint)
    return 'unknown'

  if (props.complaint.response) {
    return 'responded'
  }
  if (props.complaint.acknowledged) {
    return 'acknowledged'
  }
  return 'pending'
})

const statusConfig = computed(() => {
  switch (status.value) {
    case 'pending':
      return {
        label: 'Pending',
        variant: 'warning' as const,
        icon: 'ph:bell',
      }
    case 'acknowledged':
      return {
        label: 'Acknowledged',
        variant: 'info' as const,
        icon: 'ph:check-circle',
      }
    case 'responded':
      return {
        label: 'Responded',
        variant: 'success' as const,
        icon: 'ph:chat-circle-dots',
      }
    default:
      return {
        label: 'Unknown',
        variant: 'neutral' as const,
        icon: 'ph:question',
      }
  }
})

const canRespond = computed(() => {
  return props.complaint && (status.value === 'acknowledged' || status.value === 'pending')
})

// Watch for complaint changes to reset form
watch(() => props.complaint, (newComplaint) => {
  if (newComplaint && newComplaint.response) {
    responseText.value = newComplaint.response
  }
  else {
    responseText.value = ''
  }
  // Reset editing state when complaint changes
  isEditingResponse.value = false
}, { immediate: true })

// Handle closing the sheet
function handleClose() {
  isOpen.value = false
  emit('close')
}

// Handle acknowledge action
function handleAcknowledge() {
  if (!props.complaint)
    return
  emit('acknowledge', props.complaint.id)
}

// Handle response submission
async function handleSubmitResponse() {
  if (!props.complaint || !responseText.value.trim())
    return

  isSubmitting.value = true

  try {
    if (isEditingResponse.value && props.complaint.response) {
      // Update existing response
      emit('updateResponse', {
        id: props.complaint.id,
        response: responseText.value.trim(),
      })
    }
    else {
      // Create new response
      emit('respond', {
        id: props.complaint.id,
        response: responseText.value.trim(),
      })
    }
  }
  finally {
    isSubmitting.value = false
    isEditingResponse.value = false
  }
}

// Handle edit response
function handleEditResponse() {
  isEditingResponse.value = true
  if (props.complaint?.response) {
    responseText.value = props.complaint.response
  }
}

// Handle cancel edit
function handleCancelEdit() {
  isEditingResponse.value = false
  if (props.complaint?.response) {
    responseText.value = props.complaint.response
  }
}

// Handle remove response
function handleRemoveResponse() {
  if (!props.complaint?.response)
    return
  showRemoveConfirm.value = true
}

// Confirm remove response
function confirmRemoveResponse() {
  if (!props.complaint)
    return

  emit('removeResponse', props.complaint.id)
  isEditingResponse.value = false
  responseText.value = ''
  showRemoveConfirm.value = false
}

// Handle delete complaint
function handleDeleteComplaint() {
  showDeleteConfirm.value = true
}

// Confirm delete complaint
function confirmDeleteComplaint() {
  if (!props.complaint)
    return

  emit('deleteComplaint', props.complaint.id)
  showDeleteConfirm.value = false
  // Close the sheet and reset state after deletion
  isOpen.value = false
  emit('close')
}
</script>

<template>
  <Sheet
    :open="!!complaint && isOpen"
    position="right"
    :card="{ separators: true }"
    :size="700"
    @close="handleClose"
  >
    <template #header>
      <Flex x-between y-center gap="l" class="pr-s">
        <h4>Complaint #{{ complaint?.id }}</h4>
      </Flex>
    </template>

    <div v-if="complaint" class="complaint-details">
      <Card separators class="card-bg">
        <template #header>
          <Flex column gap="m">
            <!-- Header row with title and badge -->
            <Flex expand gap="m" y-center x-between>
              <UserDisplay
                :user-id="complaint.created_by"
                show-role
              />
              <Badge :variant="statusConfig.variant" size="s">
                <Icon :name="statusConfig.icon" />
                {{ statusConfig.label }}
              </Badge>
            </Flex>
          </Flex>
        </template>

        <!-- Message -->
        <div class="complaint-message">
          <p>{{ complaint.message }}</p>
        </div>

        <template #footer>
          <!-- Metadata row -->
          <Flex column gap="s" expand>
            <!-- Context and date info -->
            <Flex gap="l" wrap expand>
              <Flex gap="xs" y-center expand x-between>
                <Flex y-center>
                  <Icon name="ph:calendar" class="text-color-light" />
                  <span class="text-s text-color-light">
                    Created <TimestampDate :date="complaint.created_at" relative />
                  </span>
                </Flex>

                <!-- Context information -->
                <div v-if="complaint.context_user || complaint.context_gameserver">
                  <Flex gap="m" wrap>
                    <div v-if="complaint.context_user">
                      <Flex gap="xs" y-center>
                        <Icon name="ph:user" class="text-color-light" />
                        <span class="text-s text-color-light">About:</span>
                        <UserLink :user-id="complaint.context_user" />
                      </Flex>
                    </div>
                    <div v-if="complaint.context_gameserver">
                      <Flex gap="xs" y-center>
                        <Icon name="ph:game-controller" class="text-color-light" />
                        <span class="text-s text-color-light">Game Server:</span>
                        <GameServerLink :gameserver-id="complaint.context_gameserver" />
                      </Flex>
                    </div>
                  </Flex>
                </div>
              </Flex>
            </Flex>
          </Flex>
        </template>
      </Card>

      <h5>Response</h5>
      <!-- Response section -->
      <Card v-if="complaint.response && !isEditingResponse" separators class="card-bg">
        <template #header>
          <div v-if="complaint.response">
            <Flex gap="m" y-center>
              <UserDisplay
                v-if="complaint.responded_by"
                :user-id="complaint.responded_by"
                size="s"
                show-role
              />
              <div class="flex-1" />
              <Flex gap="xs">
                <Button
                  variant="gray"
                  size="s"
                  :square="!showActionLabels"
                  @click="handleEditResponse"
                >
                  <template v-if="showActionLabels" #start>
                    <Icon name="ph:pencil" />
                  </template>
                  <Icon v-if="!showActionLabels" name="ph:pencil" />
                  <template v-if="showActionLabels">
                    Edit
                  </template>
                </Button>
                <Button
                  variant="danger"
                  size="s"
                  :square="!showActionLabels"
                  @click="handleRemoveResponse"
                >
                  <template v-if="showActionLabels" #start>
                    <Icon name="ph:trash" />
                  </template>
                  <Icon v-if="!showActionLabels" name="ph:trash" />
                  <template v-if="showActionLabels">
                    Remove
                  </template>
                </Button>
              </Flex>
            </Flex>
          </div>
        </template>

        <Flex column gap="l">
          <!-- Existing response (view mode) -->
          <div v-if="complaint.response && !isEditingResponse" class="response-content">
            <p>{{ complaint.response }}</p>
          </div>
        </Flex>

        <template #footer>
          <Flex gap="xs" y-center>
            <Icon name="ph:calendar" class="text-color-light" />
            <span v-if="complaint.responded_at" class="text-s text-color-light">
              Responded <TimestampDate :date="complaint.responded_at" relative />
            </span>
          </Flex>
        </template>
      </Card>

      <Textarea
        v-else-if="canRespond || isEditingResponse"
        v-model="responseText"
        :placeholder="isEditingResponse ? 'Edit your response...' : 'Type your response to this complaint...'"
        :rows="6"
        expand
      />

      <!-- Cancel edit button -->
      <div v-if="isEditingResponse" class="edit-actions">
        <Button variant="gray" size="s" @click="handleCancelEdit">
          Cancel
        </Button>
      </div>
    </div>

    <!-- Actions -->
    <template #footer>
      <Flex gap="xs" class="form-actions">
        <!-- Acknowledge button -->
        <Button
          v-if="status === 'pending'"
          variant="accent"
          :square="!showActionLabels"
          @click="handleAcknowledge"
        >
          <template v-if="showActionLabels" #start>
            <Icon name="ph:check" />
          </template>
          <Icon v-if="!showActionLabels" name="ph:check" />
          <template v-if="showActionLabels">
            Acknowledge
          </template>
        </Button>
        <Button
          v-if="canDeleteComplaints"
          variant="danger"
          :square="!showActionLabels"
          @click="handleDeleteComplaint"
        >
          <template v-if="showActionLabels" #start>
            <Icon name="ph:trash" />
          </template>
          <template v-if="showActionLabels">
            Delete
          </template>
          <Icon v-if="!showActionLabels" name="ph:trash" />
        </Button>

        <!-- Respond/Update button -->
        <Button
          v-if="complaint && ((canRespond && responseText.trim() && !complaint.response) || isEditingResponse)"
          size="s"
          variant="success"
          :loading="isSubmitting"
          :square="!showActionLabels"
          @click="handleSubmitResponse"
        >
          <template v-if="showActionLabels" #start>
            <Icon name="ph:paper-plane-tilt" />
          </template>
          <Icon v-if="!showActionLabels" name="ph:paper-plane-tilt" />
          <template v-if="showActionLabels">
            {{ isEditingResponse ? 'Update Response' : 'Send Response' }}
          </template>
        </Button>

        <div class="flex-1" />

        <Button @click="handleClose">
          Close
        </Button>
      </Flex>
    </template>
  </Sheet>

  <!-- Remove Response Confirmation Modal -->
  <ConfirmModal
    v-model:open="showRemoveConfirm"
    :confirm="confirmRemoveResponse"
    title="Remove Response"
    description="Are you sure you want to remove this response? This action cannot be undone and will revert the complaint back to acknowledged status."
    confirm-text="Remove Response"
    cancel-text="Cancel"
    :destructive="true"
  />

  <!-- Delete Complaint Confirmation Modal -->
  <ConfirmModal
    v-model:open="showDeleteConfirm"
    :confirm="confirmDeleteComplaint"
    title="Delete Complaint"
    description="Are you sure you want to permanently delete this complaint? This action cannot be undone and will remove the complaint and all associated data."
    confirm-text="Delete Complaint"
    cancel-text="Cancel"
    :destructive="true"
  />
</template>

<style scoped lang="scss">
.complaint-details {
  display: flex;
  flex-direction: column;
  gap: var(--space-l);
  padding-bottom: var(--space);
}

.complaint-header-meta {
  border-top: 1px solid var(--color-border-light);
  padding-top: var(--space-s);
}

.complaint-message {
  line-height: 1.6;
}

.complaint-message p {
  margin: 0;
  color: var(--color-text);
  white-space: pre-wrap;
}

.response-content p {
  margin: 0;
  color: var(--color-text);
  white-space: pre-wrap;
  line-height: 1.6;
}

.response-form {
  margin-top: calc(var(--space-m) * -1);
}

.form-actions {
  margin-top: var(--space);
}

.flex-1 {
  flex: 1;
}
</style>
