<script setup lang="ts">
import { computed } from 'vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import { useIrcChat } from '@/composables/useIrcChat'

/**
 * Confirmation gate for destructive moderation actions (kick / ban / kick & ban).
 * Mounted once at the chat root so it survives the user action menu unmounting
 * on click. Reads the pending request from shared IRC state.
 */

const { moderationPrompt, executeModeration } = useIrcChat()

const open = computed({
  get: () => moderationPrompt.value !== null,
  set: (value) => {
    if (!value)
      moderationPrompt.value = null
  },
})

const copy = computed(() => {
  const req = moderationPrompt.value
  if (!req)
    return { title: '', description: '', confirmText: '' }
  const where = `${req.channel}`
  switch (req.action) {
    case 'kick':
      return {
        title: `Kick ${req.nick}?`,
        description: `Remove ${req.nick} from ${where}. They can rejoin afterwards.`,
        confirmText: 'Kick',
      }
    case 'kickban':
      return {
        title: `Kick & ban ${req.nick}?`,
        description: `Remove ${req.nick} from ${where} and ban them from rejoining until the ban is lifted.`,
        confirmText: 'Kick & ban',
      }
    default:
      return { title: '', description: '', confirmText: '' }
  }
})

function confirm() {
  if (moderationPrompt.value)
    executeModeration(moderationPrompt.value)
  moderationPrompt.value = null
}
</script>

<template>
  <ConfirmModal
    v-model:open="open"
    destructive
    :title="copy.title"
    :description="copy.description"
    :confirm-text="copy.confirmText"
    @confirm="confirm"
    @cancel="moderationPrompt = null"
  />
</template>
