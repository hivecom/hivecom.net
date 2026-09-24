<script setup lang="ts">
import { pushToast } from '@dolanske/vui'
import { ref, watch } from 'vue'
import ComplaintModal from './ComplaintModal.vue'
import ComplaintsViewer from './ComplaintsViewer.vue'

const props = defineProps<{
  targetUserId?: string
  targetUserName?: string
  contextGameserverId?: number
  contextGameserverName?: string
  contextDiscussionId?: string
  contextDiscussionReplyId?: string
  startWithSubmit?: boolean
  initialMessage?: string
}>()

const emit = defineEmits<{
  (e: 'submit', complaintData: { message: string }): void
}>()

const open = defineModel<boolean>('open', { default: false })

const user = useSupabaseUser()
const { navigateToSignIn } = useAuthRedirect()

const showViewer = ref(!props.startWithSubmit)
const showNewComplaint = ref(props.startWithSubmit || false)

watch(open, (isOpen) => {
  if (isOpen) {
    if (!user.value) {
      navigateToSignIn()
      open.value = false
      return
    }

    showViewer.value = !props.startWithSubmit
    showNewComplaint.value = props.startWithSubmit || false
  }
})

function handleNewComplaint() {
  showViewer.value = false
  showNewComplaint.value = true
}

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

function handleComplaintSubmit(data: { message: string }) {
  emit('submit', data)

  pushToast('Complaint submitted successfully', {
    description: 'Your complaint has been submitted and will be reviewed by our staff team.',
  })

  showNewComplaint.value = false
  showViewer.value = false
  open.value = false
}

function handleClose() {
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
    :context-discussion-id="contextDiscussionId"
    :context-discussion-reply-id="contextDiscussionReplyId"
    :initial-message="initialMessage"
    @submit="handleComplaintSubmit"
    @close="handleCloseNewComplaint"
  />
</template>
