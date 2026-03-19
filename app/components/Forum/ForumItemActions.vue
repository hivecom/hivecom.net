<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Alert, Button, Divider, Dropdown, DropdownItem, pushToast, Tooltip } from '@dolanske/vui'
import { useDataUser } from '@/composables/useDataUser'
import { useDiscussionCache } from '@/composables/useDiscussionCache'
import ConfirmModal from '../Shared/ConfirmModal.vue'
import ForumModalAddDiscussion from './ForumModalAddDiscussion.vue'
import ForumModalAddTopic from './ForumModalAddTopic.vue'

interface ModalControls {
  hideDiscussionTabs?: boolean
}

type Props
  = ModalControls & {
    table: 'discussion_topics'
    data: Tables<'discussion_topics'>
  } | ModalControls & {
    table: 'discussions'
    data: Tables<'discussions'>
  }

const props = defineProps<Props>()
const emit = defineEmits<{
  update: [data: Props['data']]
  remove: [id: string]
}>()
const dropdownRef = useTemplateRef('dropdownRef')
const supabase = useSupabaseClient()

const userId = useUserId()

const { user } = useDataUser(userId, { includeRole: true })
const discussionCache = useDiscussionCache()

// Locking
const lockLoading = ref(false)
const lockConfirm = ref(false)
const lockError = ref<string | null>(null)
const lockMode = ref<'lock' | 'unlock'>('lock')
const lockTarget = computed(() => props.table === 'discussions' ? 'discussion' : 'topic')
const lockTitle = computed(() => lockMode.value === 'lock'
  ? `Lock ${lockTarget.value}`
  : `Unlock ${lockTarget.value}`)
const lockDescription = computed(() => {
  if (lockMode.value === 'lock') {
    return props.table === 'discussions' && user.value?.role !== 'admin' && user.value?.role !== 'moderator'
      ? `Are you sure you want to lock this ${lockTarget.value}? Only admins and moderators will be able to unlock it.`
      : `Are you sure you want to lock this ${lockTarget.value}?`
  }
  return `Are you sure you want to unlock this ${lockTarget.value}?`
})

function handleLock(mode: 'lock' | 'unlock') {
  lockError.value = null
  lockLoading.value = true
  dropdownRef.value?.close()

  supabase
    .from(props.table)
    .update({ is_locked: mode === 'lock' })
    .eq('id', props.data.id)
    .select()
    .then(({ data, error }) => {
      const itemType = props.table === 'discussions' ? 'discussion' : 'topic'
      const itemAction = mode === 'lock' ? 'locked' : 'unlocked'

      if (error) {
        lockError.value = error.message
        pushToast(`The ${itemType} could not be ${itemAction}`, {
          description: error.message,
        })
      }
      else {
        pushToast(`The ${itemType} has been ${itemAction}`)
        const updated = data[0] as Props['data']
        if (props.table === 'discussions') {
          discussionCache.set(updated as Tables<'discussions'>)
        }
        emit('update', updated)
        lockConfirm.value = false
      }

      lockLoading.value = false
    })
}

// Archive
const archiveLoading = ref(false)
const archiveConfirm = ref(false)
const archiveError = ref<string | null>(null)
const archiveMode = ref<'archive' | 'unarchive'>('archive')
const archiveTarget = computed(() => props.table === 'discussions' ? 'discussion' : 'topic')
const archiveTitle = computed(() => archiveMode.value === 'archive'
  ? `Archive ${archiveTarget.value}`
  : `Unarchive ${archiveTarget.value}`)
const archiveDescription = computed(() => {
  if (archiveMode.value === 'archive') {
    return `Are you sure you want to archive this ${archiveTarget.value}?`
  }
  return `Are you sure you want to unarchive this ${archiveTarget.value}?`
})

function handleArchive(mode: 'archive' | 'unarchive') {
  archiveError.value = null
  archiveLoading.value = true

  const isArchived = mode === 'archive'
  const itemType = props.table === 'discussions' ? 'discussion' : 'topic'

  supabase
    .from(props.table)
    .update({ is_archived: isArchived })
    .eq('id', props.data.id)
    .select()
    .then(({ data, error }) => {
      if (error) {
        archiveError.value = error.message
      }
      else {
        pushToast(`Successfully ${isArchived ? 'archived' : 'unarchived'} ${itemType}`)
        const updated = data[0] as Props['data']
        if (props.table === 'discussions') {
          discussionCache.set(updated as Tables<'discussions'>)
        }
        emit('update', updated)
        archiveConfirm.value = false
      }

      archiveLoading.value = false
    })
}

function handleStick(mode: 'stick' | 'unstick') {
  dropdownRef.value?.close()

  supabase
    .from('discussions')
    .update({ is_sticky: !(props.data as Tables<'discussions'>).is_sticky })
    .eq('id', props.data.id)
    .select()
    .then(({ data, error }) => {
      if (error) {
        pushToast('Error updating discussion', { description: error.message })
      }
      else {
        if (mode === 'stick') {
          pushToast('Successfully pinned discussion')
        }
        else {
          pushToast('Successfully unpinned discussion')
        }

        const updated = data[0] as Tables<'discussions'>
        discussionCache.set(updated)
        emit('update', updated)
      }
    })
}

// Editing
const showEditModal = ref(false)
// function handleEdit() {}

const linkedDiscussionReason = computed(() => {
  if (props.table !== 'discussions')
    return null

  const discussion = props.data as Tables<'discussions'>
  const isLinked = Boolean(
    discussion.event_id
    || discussion.gameserver_id
    || discussion.project_id
    || discussion.profile_id
    || discussion.referendum_id,
  )

  return isLinked ? 'This discussion is linked to an entity and cannot be deleted.' : null
})

// Delete
const deleteLoading = ref(false)
const deleteConfirm = ref(false)
const deletengError = ref<string | null>(null)

function handleDelete() {
  deletengError.value = null
  deleteLoading.value = true

  supabase
    .from(props.table)
    .delete()
    .eq('id', props.data.id)
    .then(({ error }) => {
      if (error) {
        deletengError.value = error.message
      }
      else {
        emit('remove', props.data.id)
        deleteConfirm.value = false
      }

      deleteLoading.value = false
    })
}
</script>

<template>
  <div v-if="user && (user.id === data.created_by || user.role === 'admin' || user.role === 'moderator')" class="forum__item-actions">
    <Dropdown ref="dropdownRef">
      <template #trigger="{ toggle, isOpen }">
        <slot :toggle>
          <Button size="s" plain square :class="{ 'has-active-dropdown': isOpen }" @click.stop.prevent="toggle">
            <Icon name="ph:dots-three-outline-fill" />
          </Button>
        </slot>
      </template>
      <!-- Locking - topic & discussion  -->
      <!-- Unlock is restricted to admins/moderators; authors can only lock -->
      <DropdownItem
        v-if="props.data.is_locked && (user?.role === 'admin' || user?.role === 'moderator')"
        @click="lockMode = 'unlock'; lockConfirm = true"
      >
        Unlock
      </DropdownItem>
      <DropdownItem v-else-if="!props.data.is_locked" @click="lockMode = 'lock'; lockConfirm = true">
        Lock
      </DropdownItem>

      <!-- Archiving - topics & discussions -->
      <DropdownItem
        v-if="!props.data.is_archived"
        @click="archiveMode = 'archive'; archiveConfirm = true"
      >
        Archive
      </DropdownItem>
      <DropdownItem
        v-if="props.data.is_archived"
        @click="archiveMode = 'unarchive'; archiveConfirm = true"
      >
        Unarchive
      </DropdownItem>

      <!-- Sticking discussions -->
      <template v-if="props.table === 'discussions'">
        <DropdownItem v-if="props.data.is_sticky" @click="handleStick('unstick')">
          Unpin
        </DropdownItem>
        <DropdownItem v-else @click="handleStick('stick')">
          Pin
        </DropdownItem>
      </template>
      <Divider :size="0" margin="8px 0" />
      <DropdownItem @click="showEditModal = true">
        Edit
      </DropdownItem>
      <template v-if="props.table === 'discussions' && linkedDiscussionReason">
        <Tooltip placement="left">
          <template #tooltip>
            <p>{{ linkedDiscussionReason }}</p>
          </template>
          <DropdownItem class="forum__item-actions-disabled" @click.stop.prevent>
            Delete
          </DropdownItem>
        </Tooltip>
      </template>
      <DropdownItem v-else @click="deleteConfirm = true">
        Delete
      </DropdownItem>
    </Dropdown>

    <!-- Confirmation modal for locking -->
    <ConfirmModal
      v-model:open="lockConfirm"
      :confirm-loading="lockLoading"
      :title="lockTitle"
      :description="lockDescription"
      @confirm="handleLock(lockMode)"
    >
      <Alert v-if="lockError">
        {{ lockError }}
      </Alert>
    </ConfirmModal>

    <!-- Confirmation modal for archiving & deletion -->
    <!-- @confirm="handleArchive" -->
    <ConfirmModal
      v-model:open="archiveConfirm"
      :confirm-loading="archiveLoading"
      :title="archiveTitle"
      :description="archiveDescription"
      @confirm="handleArchive(archiveMode)"
    >
      <Alert v-if="archiveError">
        {{ archiveError }}
      </Alert>
    </ConfirmModal>

    <ConfirmModal
      v-model:open="deleteConfirm"
      :confirm-loading="deleteLoading"
      title="Remove"
      description="Are you sure you want to delete this item? This action cannot be undone"
      @confirm="handleDelete"
    />

    <!-- Editing modals -->
    <ForumModalAddTopic
      v-if="props.table === 'discussion_topics'"
      :open="showEditModal"
      :edited-item="props.data"
      @close="showEditModal = false"
      @created="emit('update', $event)"
    />

    <ForumModalAddDiscussion
      v-else
      :open="showEditModal"
      :edited-item="props.data"
      :hide-tabs="props.hideDiscussionTabs ?? false"
      @close="showEditModal = false"
      @created="emit('update', $event)"
    />
  </div>
</template>

<style scoped>
.forum__item-actions-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
