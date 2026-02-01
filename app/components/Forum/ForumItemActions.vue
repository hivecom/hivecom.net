<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Alert, Button, Divider, Dropdown, DropdownItem, pushToast } from '@dolanske/vui'
import ConfirmModal from '../Shared/ConfirmModal.vue'

type Props
  = {
    table: 'discussion_topics'
    data: Tables<'discussion_topics'>
  } | {
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

// Locking
function handleLock(mode: 'lock' | 'unlock') {
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
        pushToast(`The ${itemType} could not be ${itemAction}`, {
          description: error.message,
        })
      }
      else {
        pushToast(`The ${itemType} has been ${itemAction}`)
        emit('update', data[0] as Props['data'])
      }
    })
}

// Archive
const archiveLoading = ref(false)
const archiveConfirm = ref(false)
const archiveError = ref<string | null>(null)

function handleArchive() {
  archiveError.value = null
  archiveLoading.value = true

  supabase
    .from('discussion_topics')
    .update({ is_archived: true })
    .eq('id', props.data.id)
    .select()
    .then(({ data, error }) => {
      if (error) {
        archiveError.value = error.message
      }
      else {
        pushToast('Successfully archived topic')
        emit('update', data[0] as Props['data'])
        archiveConfirm.value = false
      }

      archiveLoading.value = false
    })
}

function handleStick(mode: 'stick' | 'unstick') {
  dropdownRef.value?.close()

  supabase
    .from('discussions')
    .update({ is_sticky: true })
    .eq('id', props.data.id)
    .select()
    .then(({ data, error }) => {
      if (error) {
        pushToast('Error updating discussion', { description: error.message })
      }
      else {
        if (mode === 'stick') {
          pushToast('Successfully set discussion as sticky')
        }
        else {
          pushToast('Successfully removed discussion sticky state')
        }

        emit('update', data[0] as Props['data'])
      }
    })
}

// function handleEdit() {}

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
  <div class="forum__item-actions">
    <Dropdown ref="dropdownRef">
      <template #trigger="{ toggle, isOpen }">
        <Button size="s" plain square :class="{ 'has-active-dropdown': isOpen }" @click.stop.prevent="toggle">
          <Icon name="ph:dots-three-outline-fill" />
        </Button>
      </template>
      <!-- Locking - topic & discussion  -->
      <DropdownItem v-if="props.data.is_locked" @click="handleLock('unlock')">
        Unlock
      </DropdownItem>
      <DropdownItem v-else @click="handleLock('lock')">
        Lock
      </DropdownItem>

      <!-- Archiving - topics -->
      <DropdownItem v-if="props.table === 'discussion_topics' && !props.data.is_archived" @click="archiveConfirm = true">
        Archive
      </DropdownItem>

      <!-- Sticking discussions -->
      <template v-if="props.table === 'discussions'">
        <DropdownItem v-if="!props.data.is_sticky" @click="handleStick('unstick')">
          Unstick
        </DropdownItem>
        <DropdownItem v-else @click="handleStick('stick')">
          Stick
        </DropdownItem>
      </template>
      <Divider :size="0" margin="8px 0" />
      <DropdownItem disabled>
        Edit
        <template #hint>
          Upcoming
        </template>
      </DropdownItem>
      <DropdownItem @click="deleteConfirm">
        Delete
      </DropdownItem>
    </Dropdown>

    <!-- Confirmation modal for archiving & deletion -->
    <!-- @confirm="handleArchive" -->
    <ConfirmModal
      v-model:open="archiveConfirm"
      :confirm-loading="archiveLoading"
      title="Archive topic"
      description="Are you sure you want to archive this topic? This action cannot be undone"
      @confirm="handleArchive"
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
  </div>
</template>
