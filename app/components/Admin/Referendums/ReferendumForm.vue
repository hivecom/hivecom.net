<script setup lang="ts">
import type { ReferendumFormState } from '@/lib/referendums'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database.overrides'
import { Button, Flex, Sheet, Tooltip } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import ReferendumFormFields from '@/components/Votes/ReferendumFormFields.vue'
import { emptyReferendumForm, referendumFormFromRow, referendumFormPayload, validateReferendumForm } from '@/lib/referendums'

const props = defineProps<{
  referendum: Tables<'referendums'> | null
  isEditMode: boolean
}>()

const emit = defineEmits<{
  save: [referendumData: TablesInsert<'referendums'> | TablesUpdate<'referendums'>]
  delete: [number]
}>()

const isOpen = defineModel<boolean>('isOpen')

const { hasPermission } = useAdminPermissions()
const canDeleteReferendums = computed(() => hasPermission('referendums.delete'))
const canMakePublic = computed(() => hasPermission('referendums.update'))

const referendumForm = ref<ReferendumFormState>(emptyReferendumForm())

const showDeleteConfirm = ref(false)

const saveLoading = ref(false)
const deleteLoading = ref(false)

const validation = computed(() => validateReferendumForm(referendumForm.value))

const isValid = computed(() => Object.values(validation.value).every(Boolean))

watch(
  () => props.referendum,
  (newReferendum) => {
    referendumForm.value = newReferendum ? referendumFormFromRow(newReferendum) : emptyReferendumForm()
  },
)

watch(
  () => isOpen.value,
  (newIsOpen) => {
    if (!newIsOpen) {
      saveLoading.value = false
      deleteLoading.value = false
    }
  },
)

function handleClose() {
  isOpen.value = false
}

function handleSubmit() {
  if (!isValid.value)
    return

  const referendumData = referendumFormPayload(referendumForm.value)
  if (!referendumData)
    return

  saveLoading.value = true
  emit('save', referendumData)
}

function handleDelete() {
  if (!props.referendum)
    return

  showDeleteConfirm.value = true
}

function confirmDelete() {
  if (!props.referendum)
    return

  deleteLoading.value = true

  emit('delete', props.referendum.id)
}

const formTitle = computed(() => props.isEditMode ? 'Edit Referendum' : 'Add Referendum')
const submitButtonText = computed(() => props.isEditMode ? 'Update Referendum' : 'Create Referendum')
</script>

<template>
  <Sheet
    :open="isOpen"
    position="right"
    :card="{ separators: true }"
    :size="700"
    :can-dismiss="false"
    @close="handleClose"
  >
    <template #header>
      <Flex column :gap="0">
        <h4>{{ formTitle }}</h4>
        <p v-if="props.isEditMode && props.referendum" class="text-color-light text-xs">
          {{ props.referendum.title }}
        </p>
      </Flex>
    </template>

    <div class="referendum-form">
      <ReferendumFormFields
        v-model="referendumForm"
        :validation="validation"
        :can-make-public="canMakePublic"
        :original-choices="props.isEditMode ? props.referendum?.choices : undefined"
      />
    </div>

    <template #footer>
      <Flex gap="xs" class="form-actions">
        <Button
          type="submit"
          variant="accent"
          :disabled="!isValid"
          :loading="saveLoading"
          @click.prevent="handleSubmit"
        >
          <template #start>
            <Icon name="ph:check" />
          </template>
          {{ submitButtonText }}
        </Button>

        <Button @click.prevent="handleClose">
          Cancel
        </Button>

        <div class="flex-1" />

        <Tooltip v-if="isEditMode && canDeleteReferendums">
          <Button
            variant="danger"
            square
            :loading="deleteLoading"
            @click.prevent="handleDelete"
          >
            <Icon name="ph:trash" />
          </Button>
          <template #tooltip>
            <p>Delete referendum</p>
          </template>
        </Tooltip>
      </Flex>
    </template>

    <ConfirmModal
      v-if="props.referendum"
      v-model:open="showDeleteConfirm"
      :confirm="confirmDelete"
      title="Delete Referendum"
      :description="`Are you sure you want to delete '${props.referendum.title}'? This action cannot be undone and will also delete all votes.`"
      confirm-text="Delete"
      cancel-text="Cancel"
      :destructive="true"
    />
  </Sheet>
</template>

<style lang="scss" scoped>
.referendum-form {
  padding-bottom: var(--space);
}

.form-actions {
  margin-top: var(--space);
}

.flex-1 {
  flex: 1;
}
</style>
