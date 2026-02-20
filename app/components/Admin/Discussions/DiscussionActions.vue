<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Button, Flex, pushToast } from '@dolanske/vui'
import { computed, ref } from 'vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'

type DiscussionRecord = Tables<'discussions'>

const props = defineProps<{
  discussion: Pick<DiscussionRecord, 'id' | 'is_locked' | 'is_sticky' | 'discussion_topic_id' | 'is_archived'>
  showLabels?: boolean
  size?: 's' | 'm' | 'l'
}>()

const emit = defineEmits<{
  updated: [discussion: DiscussionRecord]
}>()

const supabase = useSupabaseClient()

const lockLoading = ref(false)
const pinLoading = ref(false)
const archiveLoading = ref(false)
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
</script>

<template>
  <Flex :gap="shouldShowLabels ? 's' : 'xs'" y-center>
    <Button
      variant="danger"
      :size="buttonSize"
      :loading="lockLoading"
      :square="!shouldShowLabels"
      :data-title-top="shouldShowLabels ? undefined : (props.discussion.is_locked ? 'Unlock Discussion' : 'Lock Discussion')"
      @click="handleLockClick"
    >
      <Icon v-if="!shouldShowLabels" :name="props.discussion.is_locked ? 'ph:lock-open' : 'ph:lock'" />
      <template v-if="shouldShowLabels" #start>
        <Icon :name="props.discussion.is_locked ? 'ph:lock-open' : 'ph:lock'" />
      </template>
      <template v-if="shouldShowLabels">
        {{ props.discussion.is_locked ? 'Unlock' : 'Lock' }}
      </template>
    </Button>

    <Button
      v-if="props.discussion.discussion_topic_id"
      variant="gray"
      :size="buttonSize"
      :loading="pinLoading"
      :square="!shouldShowLabels"
      :data-title-top-right="shouldShowLabels ? undefined : (props.discussion.is_sticky ? 'Unpin Discussion' : 'Pin Discussion')"
      @click="handlePinClick"
    >
      <Icon v-if="!shouldShowLabels" :name="props.discussion.is_sticky ? 'ph:push-pin-slash' : 'ph:push-pin'" />
      <template v-if="shouldShowLabels" #start>
        <Icon :name="props.discussion.is_sticky ? 'ph:push-pin-slash' : 'ph:push-pin'" />
      </template>
      <template v-if="shouldShowLabels">
        {{ props.discussion.is_sticky ? 'Unpin' : 'Pin' }}
      </template>
    </Button>

    <Button
      variant="gray"
      :size="buttonSize"
      :loading="archiveLoading"
      :square="!shouldShowLabels"
      :data-title-top-right="shouldShowLabels ? undefined : (props.discussion.is_archived ? 'Unarchive Discussion' : 'Archive Discussion')"
      @click="handleArchiveClick"
    >
      <Icon v-if="!shouldShowLabels" name="ph:archive" />
      <template v-if="shouldShowLabels" #start>
        <Icon name="ph:archive" />
      </template>
      <template v-if="shouldShowLabels">
        {{ props.discussion.is_archived ? 'Unarchive' : 'Archive' }}
      </template>
    </Button>

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
  </Flex>
</template>
