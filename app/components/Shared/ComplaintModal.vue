<script setup lang="ts">
import { Button, Flex, Modal, Textarea } from '@dolanske/vui'
import { ref } from 'vue'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{
  open: boolean
  targetUserId?: string
  targetUserName?: string
  contextGameserverId?: number
  contextGameserverName?: string
}>()

const emit = defineEmits<{
  (e: 'submit', complaintData: { message: string }): void
  (e: 'close'): void
}>()

// Form state
const complaintMessage = ref('')
const isSubmitting = ref(false)
const isBelowSmall = useBreakpoint('<xs')

// Get current user
const user = useSupabaseUser()
const userId = useUserId()
const supabase = useSupabaseClient()

async function handleSubmit() {
  if (!complaintMessage.value.trim() || !user.value || !userId.value) {
    return
  }

  isSubmitting.value = true

  try {
    const complaintData: {
      created_by: string
      message: string
      context_user?: string
      context_gameserver?: number
    } = {
      created_by: userId.value,
      message: complaintMessage.value.trim(),
    }

    // Add context fields if provided
    if (props.targetUserId) {
      complaintData.context_user = props.targetUserId
    }
    if (props.contextGameserverId) {
      complaintData.context_gameserver = props.contextGameserverId
    }

    const { error } = await supabase
      .from('complaints')
      .insert(complaintData)

    if (error) {
      throw error
    }

    // Emit success event
    emit('submit', { message: complaintMessage.value.trim() })

    // Close modal and reset form
    resetForm()
    emit('close')
  }
  catch (error: unknown) {
    console.error('Error submitting complaint:', (error as Error).message)
    // You might want to show an error toast/notification here
  }
  finally {
    isSubmitting.value = false
  }
}

function resetForm() {
  complaintMessage.value = ''
  isSubmitting.value = false
}

function handleClose() {
  if (!isSubmitting.value) {
    resetForm()
    emit('close')
  }
}
</script>

<template>
  <Modal :open="props.open" :size="isBelowSmall ? 'screen' : undefined" @close="handleClose">
    <template #header>
      <h3>Submit Complaint</h3>
    </template>

    <Flex column gap="m" class="complaint-modal-content">
      <p v-if="targetUserName" class="text-color-light">
        You are submitting a complaint about <strong>{{ targetUserName }}</strong>.
        This will be reviewed by our staff.
      </p>
      <p v-else-if="contextGameserverName" class="text-color-light">
        You are submitting a complaint about the game server <strong>{{ contextGameserverName }}</strong>.
        This will be reviewed by our staff.
      </p>
      <p v-else class="text-color-light">
        Please describe your complaint in detail. This will be reviewed by our staff.
      </p>

      <Textarea
        v-model="complaintMessage"
        expand
        placeholder="Describe your complaint..."
        multiline
        :rows="6"
        :disabled="isSubmitting"
        required
      />

      <Flex class="complaint-modal-guidelines" expand column>
        <h6>Guidelines for Complaints</h6>
        <ul>
          <li>Be respectful and factual in your description</li>
          <li>Include specific details about what happened</li>
          <li>Avoid personal attacks or inflammatory language</li>
          <li>Our team will investigate and respond appropriately</li>
        </ul>
      </Flex>
    </Flex>

    <template #footer>
      <Flex gap="s" x-end expand>
        <Button
          variant="gray"
          :expand="isBelowSmall"
          :disabled="isSubmitting"
          @click="handleClose"
        >
          Cancel
        </Button>
        <Button
          variant="accent"
          :expand="isBelowSmall"
          :loading="isSubmitting"
          :disabled="!complaintMessage.trim() || isSubmitting"
          @click="handleSubmit"
        >
          Submit Complaint
        </Button>
      </Flex>
    </template>
  </Modal>
</template>

<style scoped lang="scss">
.complaint-modal-content {
  max-width: 600px;
}

.complaint-modal-guidelines {
  padding: 16px;
  background: var(--color-bg-raised);
  border-radius: 8px;
  border: 1px solid var(--color-border);
}

.complaint-modal-guidelines h6 {
  margin: 0 0 8px 0;
  color: var(--color-text);
}

.complaint-modal-guidelines ul {
  margin: 0;
  padding-left: 20px;
  font-size: var(--font-size-s);
  line-height: 1.5;
  list-style-type: disc;
  color: var(--color-text-light);
}

.complaint-modal-guidelines li {
  margin-bottom: 4px;
}

.complaint-modal-guidelines li:last-child {
  margin-bottom: 0;
}
</style>
