<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Flex, pushToast, Tooltip } from '@dolanske/vui'
import { computed, ref } from 'vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import ResponsiveButton from '@/components/Shared/ResponsiveButton.vue'
import { useDiscussionCache } from '@/composables/useDiscussionCache'

type DiscussionRecord = Tables<'discussions'>

const props = defineProps<{
  discussion: Pick<DiscussionRecord, 'id' | 'is_locked' | 'is_sticky' | 'discussion_topic_id' | 'is_archived'>
  showLabels?: boolean
  hidePinButton?: boolean
  size?: 's' | 'm' | 'l'
}>()

const emit = defineEmits<{
  updated: [discussion: DiscussionRecord]
  deleted: []
}>()

const supabase = useSupabaseClient()
const discussionCache = useDiscussionCache()

const lockLoading = ref(false)
const pinLoading = ref(false)
const archiveLoading = ref(false)
const deleteLoading = ref(false)
const showDeleteConfirm = ref(false)
const showLockConfirm = ref(false)
const showArchiveConfirm = ref(false)
const archiveMode = ref<'archive' | 'unarchive'>('archive')

const shouldShowLabels = computed(() => !!props.showLabels)
const buttonSize = computed(() => props.size ?? (shouldShowLabels.value ? 'm' : 's'))

function updateDiscussion(payload: Partial<DiscussionRecord>) {
  return supabase
    .from('discussions')
    .update(payload)
    .eq('id', props.discussion.id)
    .select()
    .single()
}

async function applyLock(nextValue: boolean) {
  lockLoading.value = true

  try {
    const { data, error } = await updateDiscussion({ is_locked: nextValue })

    if (error)
      throw error

    discussionCache.set(data)
    emit('updated', data)
    pushToast(nextValue ? 'Discussion locked' : 'Discussion unlocked')
  }
  catch (error) {
    pushToast('Failed to update discussion', {
      description: error instanceof Error ? error.message : 'Unknown error',
    })
  }
  finally {
    lockLoading.value = false
  }
}

async function applyPin(nextValue: boolean) {
  pinLoading.value = true

  try {
    const { data, error } = await updateDiscussion({ is_sticky: nextValue })

    if (error)
      throw error

    discussionCache.set(data)
    emit('updated', data)
    pushToast(nextValue ? 'Discussion pinned' : 'Discussion unpinned')
  }
  catch (error) {
    pushToast('Failed to update discussion', {
      description: error instanceof Error ? error.message : 'Unknown error',
    })
  }
  finally {
    pinLoading.value = false
  }
}

async function applyArchive(nextValue: boolean) {
  archiveLoading.value = true

  try {
    const { data, error } = await updateDiscussion({ is_archived: nextValue })

    if (error)
      throw error

    discussionCache.set(data)
    emit('updated', data)
    pushToast(nextValue ? 'Discussion archived' : 'Discussion unarchived')
    showArchiveConfirm.value = false
  }
  catch (error) {
    pushToast('Failed to update discussion', {
      description: error instanceof Error ? error.message : 'Unknown error',
    })
  }
  finally {
    archiveLoading.value = false
  }
}

function handleLockClick() {
  if (props.discussion.is_locked) {
    applyLock(false)
    return
  }

  showLockConfirm.value = true
}

function handlePinClick() {
  applyPin(!props.discussion.is_sticky)
}

function handleArchiveClick() {
  archiveMode.value = props.discussion.is_archived ? 'unarchive' : 'archive'
  showArchiveConfirm.value = true
}

async function handleDeletion() {
  deleteLoading.value = true

  try {
    const { error } = await supabase
      .from('discussions')
      .delete()
      .eq('id', props.discussion.id)

    if (error)
      throw error

    discussionCache.invalidate(props.discussion.id)
    pushToast('Deleted discussion')
    showDeleteConfirm.value = false
  }
  catch (error) {
    pushToast('Failed to update discussion', {
      description: error instanceof Error ? error.message : 'Unknown error',
    })
  }
  finally {
    deleteLoading.value = false
  }
}
</script>

<template>
  <Flex gap="xs" y-center>
    <Tooltip v-if="props.discussion.discussion_topic_id && !props.hidePinButton" :disabled="shouldShowLabels">
      <ResponsiveButton
        :collapsed="!shouldShowLabels"
        :size="buttonSize"
        variant="gray"
        :loading="pinLoading"
        :icon="props.discussion.is_sticky ? 'ph:push-pin-slash' : 'ph:push-pin'"
        :label="props.discussion.is_sticky ? 'Unpin' : 'Pin'"
        @click="handlePinClick"
      />
      <template #tooltip>
        <p>{{ props.discussion.is_sticky ? 'Unpin Discussion' : 'Pin Discussion' }}</p>
      </template>
    </Tooltip>

    <Tooltip :disabled="shouldShowLabels">
      <ResponsiveButton
        :collapsed="!shouldShowLabels"
        :size="buttonSize"
        variant="gray"
        :loading="archiveLoading"
        icon="ph:archive"
        :label="props.discussion.is_archived ? 'Unarchive' : 'Archive'"
        @click="handleArchiveClick"
      />
      <template #tooltip>
        <p>{{ props.discussion.is_archived ? 'Unarchive Discussion' : 'Archive Discussion' }}</p>
      </template>
    </Tooltip>

    <Tooltip :disabled="shouldShowLabels">
      <ResponsiveButton
        :collapsed="!shouldShowLabels"
        :size="buttonSize"
        variant="danger"
        :loading="lockLoading"
        :icon="props.discussion.is_locked ? 'ph:lock-open' : 'ph:lock'"
        :label="props.discussion.is_locked ? 'Unlock' : 'Lock'"
        @click="handleLockClick"
      />
      <template #tooltip>
        <p>{{ props.discussion.is_locked ? 'Unlock Discussion' : 'Lock Discussion' }}</p>
      </template>
    </Tooltip>

    <Tooltip :disabled="shouldShowLabels">
      <ResponsiveButton
        :collapsed="!shouldShowLabels"
        :size="buttonSize"
        variant="danger"
        :loading="deleteLoading"
        icon="ph:trash"
        label="Delete"
        @click="showDeleteConfirm = true"
      />
      <template #tooltip>
        <p>Delete Discussion</p>
      </template>
    </Tooltip>

    <ConfirmModal
      v-model:open="showLockConfirm"
      :confirm="() => applyLock(true)"
      :confirm-loading="lockLoading"
      title="Lock discussion"
      description="Are you sure you want to lock this discussion? Users will no longer be able to reply."
      confirm-text="Lock"
      cancel-text="Cancel"
      :destructive="true"
    />

    <ConfirmModal
      v-model:open="showArchiveConfirm"
      :confirm="() => applyArchive(archiveMode === 'archive')"
      :confirm-loading="archiveLoading"
      :title="archiveMode === 'archive' ? 'Archive discussion' : 'Unarchive discussion'"
      :description="archiveMode === 'archive' ? 'Are you sure you want to archive this discussion?' : 'Are you sure you want to unarchive this discussion?'"
      :confirm-text="archiveMode === 'archive' ? 'Archive' : 'Unarchive'"
      cancel-text="Cancel"
      :destructive="archiveMode === 'archive'"
    />

    <ConfirmModal
      v-model:open="showDeleteConfirm"
      :confirm="handleDeletion"
      title="Confirm Prune Action"
      description="Are you sure you want to delete this discussion? This action cannot be undone."
      confirm-text="Prune"
      cancel-text="Cancel"
      :destructive="true"
      :confirm-loading="deleteLoading"
    />
  </Flex>
</template>
