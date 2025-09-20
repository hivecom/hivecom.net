<script setup lang="ts">
import { pushToast, Toasts } from '@dolanske/vui'
import { ref, watch } from 'vue'
import ComplaintModal from './ComplaintModal.vue'
import ComplaintsViewer from './ComplaintsViewer.vue'

const props = defineProps<{
  targetUserId?: string
  targetUserName?: string
  contextGameserverId?: number
  contextGameserverName?: string
  startWithSubmit?: boolean // New prop to control initial view
}>()

const emit = defineEmits<{
  (e: 'submit', complaintData: { message: string }): void
}>()

const open = defineModel<boolean>('open', { default: false })

// Get current user for authentication check
const user = useSupabaseUser()

// State for nested modals
const showViewer = ref(!props.startWithSubmit) // Show viewer by default unless startWithSubmit is true
const showNewComplaint = ref(props.startWithSubmit || false) // Show new complaint form if startWithSubmit is true

// Watch for modal opening to check authentication and reset states
watch(open, (isOpen) => {
  if (isOpen) {
    // Check if user is authenticated
    if (!user.value) {
      // Redirect to sign-in page if not authenticated
      navigateTo('/auth/sign-in')
      open.value = false
      return
    }

    // Reset states based on startWithSubmit when modal opens
    showViewer.value = !props.startWithSubmit
    showNewComplaint.value = props.startWithSubmit || false
  }
})

// Handle opening new complaint modal
function handleNewComplaint() {
  showViewer.value = false
  showNewComplaint.value = true
}

// Handle closing new complaint modal
function handleCloseNewComplaint() {
  showNewComplaint.value = false
  // If we started with submit, close completely instead of showing viewer
  if (props.startWithSubmit) {
    open.value = false
  }
  else {
    showViewer.value = true
  }
}

// Handle complaint submission
function handleComplaintSubmit(data: { message: string }) {
  emit('submit', data)

  // Show success toast notification
  pushToast('Complaint submitted successfully', {
    description: 'Your complaint has been submitted and will be reviewed by our staff team.',
  })

  // Close both modals
  showNewComplaint.value = false
  showViewer.value = false
  open.value = false
}

// Handle closing the main modal
function handleClose() {
  // Reset states based on startWithSubmit prop
  showViewer.value = !props.startWithSubmit
  showNewComplaint.value = props.startWithSubmit || false
  open.value = false
}
</script>

<template>
  <ComplaintsViewer
    :open="open && showViewer"
    @close="handleClose"
    @new-complaint="handleNewComplaint"
  />

  <ComplaintModal
    :open="open && showNewComplaint"
    :target-user-id="targetUserId"
    :target-user-name="targetUserName"
    :context-gameserver-id="contextGameserverId"
    :context-gameserver-name="contextGameserverName"
    @submit="handleComplaintSubmit"
    @close="handleCloseNewComplaint"
  />

  <Toasts />
</template>
