<script setup lang="ts">
import type { ReferendumFormState } from '@/lib/referendums'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database.overrides'
import { Button, Flex, Modal, Tooltip } from '@dolanske/vui'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import ReferendumFormFields from '@/components/Votes/ReferendumFormFields.vue'
import { useDiscussionSubscriptionsCache } from '@/composables/useDiscussionSubscriptionsCache'
import { usePermissions } from '@/composables/usePermissions'
import { emptyReferendumForm, referendumFormFromRow, referendumFormPayload, validateReferendumForm } from '@/lib/referendums'

interface Props {
  open: boolean
  editedItem?: Tables<'referendums'> | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', referendum: Tables<'referendums'>): void
  (e: 'updated', referendum: Tables<'referendums'>): void
  (e: 'deleted', referendumId: number): void
}>()

const supabase = useSupabaseClient()
const userId = useUserId()
const subscriptionsCache = useDiscussionSubscriptionsCache()

// ─── Permission check ─────────────────────────────────────────────────────────
// Anyone can create a private vote. Going public and deleting are staff grants.

const { hasPermission } = usePermissions()

const canMakePublic = computed(() => hasPermission('referendums.update'))
const canDelete = computed(() => hasPermission('referendums.delete'))

// ─── Mode ─────────────────────────────────────────────────────────────────────

const isEditing = computed(() => !!props.editedItem)

// ─── Form state ───────────────────────────────────────────────────────────────

const form = ref<ReferendumFormState>(emptyReferendumForm())

const saveLoading = ref(false)
const showDeleteConfirm = ref(false)
const deleteLoading = ref(false)

function resetForm() {
  form.value = emptyReferendumForm()
}

function populateForm(referendum: Tables<'referendums'>) {
  form.value = referendumFormFromRow(referendum)
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      if (props.editedItem != null) {
        populateForm(props.editedItem)
      }
      else {
        resetForm()
      }
    }
    else {
      resetForm()
      saveLoading.value = false
      deleteLoading.value = false
      showDeleteConfirm.value = false
    }
  },
)

// Re-populate when editedItem changes while modal is open
watch(
  () => props.editedItem,
  (item) => {
    if (props.open) {
      if (item != null) {
        populateForm(item)
      }
      else {
        resetForm()
      }
    }
  },
)

// ─── Validation ───────────────────────────────────────────────────────────────

const validation = computed(() => validateReferendumForm(form.value))

const isValid = computed(() => Object.values(validation.value).every(Boolean))

// ─── Submit ───────────────────────────────────────────────────────────────────

async function handleSubmit() {
  if (!isValid.value || !userId.value)
    return

  const fields = referendumFormPayload(form.value)
  if (!fields)
    return

  saveLoading.value = true

  try {
    if (isEditing.value && props.editedItem != null) {
      const payload: TablesUpdate<'referendums'> = {
        ...fields,
        modified_at: new Date().toISOString(),
        modified_by: userId.value,
      }

      const { data, error } = await supabase
        .from('referendums')
        .update(payload)
        .eq('id', props.editedItem.id)
        .select('*')
        .single()

      if (error)
        throw error

      emit('updated', data as Tables<'referendums'>)
    }
    else {
      const payload: TablesInsert<'referendums'> = {
        ...fields,
        created_by: userId.value,
        modified_by: userId.value,
        modified_at: new Date().toISOString(),
      }

      const { data, error } = await supabase
        .from('referendums')
        .insert(payload)
        .select('*')
        .single()

      if (error)
        throw error

      if (userId.value)
        subscriptionsCache.invalidateList(userId.value)

      resetForm()
      emit('created', data as Tables<'referendums'>)
    }
  }
  catch (err) {
    console.error('Error saving referendum:', err)
  }
  finally {
    saveLoading.value = false
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

async function confirmDelete() {
  if (!props.editedItem)
    return

  deleteLoading.value = true

  try {
    const { error } = await supabase
      .from('referendums')
      .delete()
      .eq('id', props.editedItem.id)

    if (error)
      throw error

    emit('deleted', props.editedItem.id)
  }
  catch (err) {
    console.error('Error deleting referendum:', err)
  }
  finally {
    deleteLoading.value = false
    showDeleteConfirm.value = false
  }
}

function handleClose() {
  emit('close')
}
</script>

<template>
  <Modal
    :open="open"
    size="m"
    :can-dismiss="false"
    :card="{ separators: true }"
    @close="handleClose"
  >
    <template #header>
      <Flex column :gap="0">
        <h4>{{ isEditing ? 'Edit vote' : 'New vote' }}</h4>
        <p class="text-color-light text-xs">
          {{ isEditing ? props.editedItem?.title : 'Create vote for others to participate in' }}
        </p>
      </Flex>
    </template>

    <p class="mb-l text-color-light">
      {{ isEditing ? 'Update the details of your vote.' : 'Create a vote for others to participate in. You can share the link once created.' }}
    </p>

    <ReferendumFormFields
      v-model="form"
      :validation="validation"
      :can-make-public="canMakePublic"
      :original-choices="props.editedItem?.choices"
    />

    <template #footer>
      <Flex gap="xs" x-between expand>
        <Flex gap="xs">
          <Tooltip v-if="isEditing && canDelete">
            <Button
              variant="danger"
              square
              :loading="deleteLoading"
              @click="showDeleteConfirm = true"
            >
              <Icon name="ph:trash" />
            </Button>
            <template #tooltip>
              <p>Delete vote</p>
            </template>
          </Tooltip>
        </Flex>

        <Flex gap="xs">
          <Button plain @click="handleClose">
            Cancel
          </Button>
          <Button
            variant="accent"
            :disabled="!isValid"
            :loading="saveLoading"
            @click="handleSubmit"
          >
            {{ isEditing ? 'Save changes' : 'Create vote' }}
          </Button>
        </Flex>
      </Flex>
    </template>
  </Modal>

  <ConfirmModal
    v-if="isEditing && props.editedItem != null"
    v-model:open="showDeleteConfirm"
    :confirm-loading="deleteLoading"
    title="Delete vote"
    :description="`Are you sure you want to delete '${props.editedItem?.title}'? This cannot be undone and will also delete all existing votes.`"
    confirm-text="Delete"
    :destructive="true"
    :confirm="confirmDelete"
  />
</template>
