<script setup lang="ts">
import { Badge, Button, Flex, Sheet, Textarea } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'

// Interface for complaint data
interface Complaint {
  id: number
  created_at: string
  created_by: string
  message: string
  acknowledged: boolean
  responded_at: string | null
  responded_by: string | null
  response: string | null
}

const props = defineProps<{
  complaint: Complaint | null
}>()

const emit = defineEmits<{
  (e: 'acknowledge', id: number): void
  (e: 'respond', data: { id: number, response: string }): void
  (e: 'updateResponse', data: { id: number, response: string }): void
  (e: 'removeResponse', id: number): void
  (e: 'close'): void
}>()

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// Response form state
const responseText = ref('')
const isSubmitting = ref(false)
const isEditingResponse = ref(false)
const showRemoveConfirm = ref(false)

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
  return 'new'
})

const statusConfig = computed(() => {
  switch (status.value) {
    case 'new':
      return {
        label: 'New',
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
  return props.complaint && (status.value === 'acknowledged' || status.value === 'new')
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
</script>

<template>
  <Sheet
    :open="!!complaint && isOpen"
    position="right"
    separator
    :size="700"
    @close="handleClose"
  >
    <template #header>
      <Flex column :gap="0">
        <h4>Complaint #{{ complaint?.id }}</h4>
      </Flex>
    </template>

    <div v-if="complaint" class="complaint-details">
      <!-- Complaint -->
      <div class="complaint-section">
        <Flex expand gap="m" y-center x-between>
          <h5>Complaint</h5>
          <Badge :variant="statusConfig.variant" size="s">
            <Icon :name="statusConfig.icon" />
            {{ statusConfig.label }}
          </Badge>
        </Flex>

        <!-- User info -->
        <div class="complaint-user">
          <UserDisplay
            :user-id="complaint.created_by"
            show-role
          />
        </div>

        <!-- Submitted date -->
        <div class="complaint-meta">
          <Flex gap="xs" y-center>
            <Icon name="ph:calendar" class="color-text-light" />
            <span class="text-s color-text-light">
              Submitted <TimestampDate :date="complaint.created_at" relative />
            </span>
          </Flex>
        </div>

        <!-- Message -->
        <div class="complaint-message">
          <p>{{ complaint.message }}</p>
        </div>
      </div>

      <!-- Response section -->
      <div v-if="complaint.response || canRespond || isEditingResponse" class="response-section">
        <h5>Admin Response</h5>

        <!-- Existing response (view mode) -->
        <div v-if="complaint.response && !isEditingResponse" class="existing-response">
          <div class="response-meta">
            <Flex gap="m" y-center>
              <UserDisplay
                v-if="complaint.responded_by"
                :user-id="complaint.responded_by"
                size="s"
                show-role
              />
              <span v-if="complaint.responded_at" class="text-s color-text-light">
                Responded <TimestampDate :date="complaint.responded_at" relative />
              </span>
              <div class="flex-1" />
              <Flex gap="xs">
                <Button variant="gray" size="s" @click="handleEditResponse">
                  <template #start>
                    <Icon name="ph:pencil" />
                  </template>
                  Edit
                </Button>
                <Button variant="danger" size="s" @click="handleRemoveResponse">
                  <template #start>
                    <Icon name="ph:trash" />
                  </template>
                  Remove
                </Button>
              </Flex>
            </Flex>
          </div>

          <div class="response-content">
            <p>{{ complaint.response }}</p>
          </div>
        </div>

        <!-- Response form (new response or edit mode) -->
        <Flex v-if="(canRespond && !complaint.response) || isEditingResponse" column class="response-form">
          <Textarea
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
        </Flex>
      </div>
    </div>

    <!-- Actions -->
    <template #footer>
      <Flex gap="xs" class="form-actions">
        <!-- Acknowledge button -->
        <Button
          v-if="status === 'new'"
          variant="accent"
          @click="handleAcknowledge"
        >
          <template #start>
            <Icon name="ph:check" />
          </template>
          Acknowledge
        </Button>

        <!-- Respond/Update button -->
        <Button
          v-if="complaint && ((canRespond && responseText.trim() && !complaint.response) || isEditingResponse)"
          variant="success"
          :loading="isSubmitting"
          @click="handleSubmitResponse"
        >
          <template #start>
            <Icon name="ph:paper-plane-tilt" />
          </template>
          {{ isEditingResponse ? 'Update Response' : 'Send Response' }}
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
    v-model:confirm="confirmRemoveResponse"
    title="Remove Response"
    description="Are you sure you want to remove this response? This action cannot be undone and will revert the complaint back to acknowledged status."
    confirm-text="Remove Response"
    cancel-text="Cancel"
    :destructive="true"
  />
</template>

<style scoped>
.complaint-details {
  display: flex;
  flex-direction: column;
  gap: var(--space-l);
  padding-bottom: var(--space);
}

.complaint-section,
.response-section {
  padding: var(--space-l);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);
  background-color: var(--color-bg-subtle);
}

.complaint-section h5,
.response-section h5 {
  margin: 0 0 var(--space-m) 0;
  color: var(--color-text);
}

.complaint-user {
  margin-bottom: var(--space-m);
}

.complaint-meta {
  margin-bottom: var(--space-m);
}

.complaint-message {
  line-height: 1.6;
}

.complaint-message p {
  margin: 0;
  color: var(--color-text);
  white-space: pre-wrap;
}

.existing-response {
  padding: var(--space-m);
  background-color: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-s);
}

.response-meta {
  margin-bottom: var(--space-m);
  padding-bottom: var(--space-s);
  border-bottom: 1px solid var(--color-border);
}

.response-content p {
  margin: 0;
  color: var(--color-text);
  white-space: pre-wrap;
  line-height: 1.6;
}

.response-form {
  margin-top: var(--space-m);
}

.form-actions {
  margin-top: var(--space);
}

.flex-1 {
  flex: 1;
}
</style>
