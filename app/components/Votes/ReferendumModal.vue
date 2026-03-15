<script setup lang="ts">
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database.overrides'
import { Badge, Button, Calendar, Checkbox, Flex, Input, Modal, Textarea, Tooltip } from '@dolanske/vui'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'

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

// ─── Permission check (direct DB query, works outside admin layout) ───────────

const canMakePublic = ref(false)
const canDelete = ref(false)

onBeforeMount(async () => {
  const uid = userId.value
  if (!uid)
    return

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', uid)
    .maybeSingle()

  if (!roleData?.role)
    return

  const { data: permData } = await supabase
    .from('role_permissions')
    .select('permission')
    .eq('role', roleData.role)
    .in('permission', ['referendums.update', 'referendums.delete'])

  const perms = new Set((permData ?? []).map(p => p.permission))
  canMakePublic.value = perms.has('referendums.update')
  canDelete.value = perms.has('referendums.delete')
})

// ─── Mode ─────────────────────────────────────────────────────────────────────

const isEditing = computed(() => !!props.editedItem)

// ─── Form state ───────────────────────────────────────────────────────────────

const form = ref({
  title: '',
  description: '',
  date_start: new Date() as Date | null,
  date_end: null as Date | null,
  multiple_choice: false,
  is_public: false,
  choices: [] as string[],
})

const newChoiceInput = ref('')
const saveLoading = ref(false)
const showDeleteConfirm = ref(false)
const deleteLoading = ref(false)

function resetForm() {
  form.value = {
    title: '',
    description: '',
    date_start: new Date(),
    date_end: null,
    multiple_choice: false,
    is_public: false,
    choices: [],
  }
  newChoiceInput.value = ''
}

function populateForm(referendum: Tables<'referendums'>) {
  form.value = {
    title: referendum.title,
    description: referendum.description ?? '',
    date_start: referendum.date_start ? new Date(referendum.date_start) : new Date(),
    date_end: referendum.date_end ? new Date(referendum.date_end) : null,
    multiple_choice: referendum.multiple_choice,
    is_public: referendum.is_public,
    choices: [...referendum.choices],
  }
  newChoiceInput.value = ''
}

watch(
  () => props.editedItem,
  (item) => {
    if (item != null) {
      populateForm(item)
    }
    else {
      resetForm()
    }
  },
  { immediate: true },
)

// Reset loading when closed
watch(
  () => props.open,
  (open) => {
    if (!open) {
      saveLoading.value = false
      deleteLoading.value = false
    }
  },
)

// ─── Validation ───────────────────────────────────────────────────────────────

const validation = computed(() => {
  const { date_start, date_end } = form.value
  return {
    title: !!form.value.title.trim(),
    date_start: !!date_start,
    date_end: !!date_end,
    choices: form.value.choices.length >= 2,
    dateRange: date_end != null ? date_end > new Date() : false,
    startBeforeEnd: date_start != null && date_end != null ? date_end > date_start : true,
  }
})

const isValid = computed(() =>
  validation.value.title
  && validation.value.date_start
  && validation.value.date_end
  && validation.value.choices
  && validation.value.dateRange
  && validation.value.startBeforeEnd,
)

const isRemovingChoices = computed(() => {
  if (!isEditing.value || !props.editedItem)
    return false
  return props.editedItem.choices.some(c => !form.value.choices.includes(c))
})

// ─── Choices ──────────────────────────────────────────────────────────────────

function addChoice() {
  const choice = newChoiceInput.value.trim()
  if (choice !== '' && !form.value.choices.includes(choice)) {
    form.value.choices.push(choice)
    newChoiceInput.value = ''
  }
}

function removeChoice(index: number) {
  form.value.choices.splice(index, 1)
}

function handleChoiceKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    addChoice()
  }
}

// ─── Submit ───────────────────────────────────────────────────────────────────

async function handleSubmit() {
  if (!isValid.value || !userId.value)
    return

  const dateStart = form.value.date_start?.toISOString()
  const dateEnd = form.value.date_end?.toISOString()
  if (!dateStart || !dateEnd)
    return

  saveLoading.value = true

  try {
    if (isEditing.value && props.editedItem != null) {
      const payload: TablesUpdate<'referendums'> = {
        title: form.value.title.trim(),
        description: form.value.description.trim() || null,
        date_start: dateStart,
        date_end: dateEnd,
        multiple_choice: form.value.multiple_choice,
        is_public: form.value.is_public,
        choices: form.value.choices,
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
        title: form.value.title.trim(),
        description: form.value.description.trim() || null,
        date_start: dateStart,
        date_end: dateEnd,
        multiple_choice: form.value.multiple_choice,
        is_public: form.value.is_public,
        choices: form.value.choices,
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
    :card="{ footerSeparator: true }"
    @close="handleClose"
  >
    <template #header>
      <h3>{{ isEditing ? 'Edit vote' : 'New vote' }}</h3>
    </template>

    <p class="mb-l text-color-light">
      {{ isEditing ? 'Update the details of your vote.' : 'Create a vote for others to participate in. You can share the link once created.' }}
    </p>

    <Flex column gap="m">
      <!-- Title -->
      <Input
        v-model="form.title"
        expand
        label="Title"
        name="title"
        placeholder="What are you voting on?"
        required
        :valid="form.title.trim() !== '' ? validation.title : undefined"
        error="Title is required"
      />

      <!-- Description -->
      <Textarea
        v-model="form.description"
        expand
        label="Description"
        name="description"
        placeholder="Add more context (optional)"
        :rows="3"
      />

      <!-- Dates -->
      <Flex gap="m" :column="false" wrap expand>
        <Flex column expand :gap="0">
          <label class="form-label">
            Start Date <span class="form-required">*</span>
          </label>
          <Calendar
            v-model="form.date_start"
            expand
            enable-time-picker
            time-picker-inline
            enable-minutes
            is24
            format="yyyy-MM-dd HH:mm"
          >
            <template #trigger>
              <Button
                expand
                :class="{ error: form.date_start == null }"
              >
                {{ form.date_start ? form.date_start.toLocaleString('en-US', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                }) : 'Choose start date' }}
                <template #end>
                  <Icon name="ph:calendar" />
                </template>
              </Button>
            </template>
          </Calendar>
        </Flex>

        <Flex column expand :gap="0">
          <label class="form-label">
            End Date <span class="form-required">*</span>
          </label>
          <Calendar
            v-model="form.date_end"
            expand
            enable-time-picker
            time-picker-inline
            enable-minutes
            is24
            format="yyyy-MM-dd HH:mm"
          >
            <template #trigger>
              <Button
                expand
                :class="{ error: form.date_end == null || !validation.dateRange || !validation.startBeforeEnd }"
              >
                {{ form.date_end ? form.date_end.toLocaleString('en-US', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                }) : 'Choose end date' }}
                <template #end>
                  <Icon name="ph:calendar" />
                </template>
              </Button>
            </template>
          </Calendar>
          <span v-if="form.date_end != null && !validation.startBeforeEnd" class="form-error">
            End date must be after start date
          </span>
          <span v-else-if="form.date_end != null && !validation.dateRange" class="form-error">
            End date must be in the future
          </span>
        </Flex>
      </Flex>

      <!-- Options -->
      <Flex gap="l" y-center expand>
        <Checkbox
          v-model="form.multiple_choice"
          name="multiple_choice"
          label="Allow multiple choice"
        />
        <Flex v-if="canMakePublic" gap="xs" y-center>
          <Checkbox
            v-model="form.is_public"
            name="is_public"
            label="Show on public votes page"
          />
          <Tooltip>
            <Icon name="ph:info" class="text-color-lighter" />
            <template #tooltip>
              <p>Public votes appear in the votes listing for all users.</p>
            </template>
          </Tooltip>
        </Flex>
      </Flex>

      <!-- Choices -->
      <Flex column :gap="0" expand>
        <label class="form-label">
          Voting choices <span class="form-required">*</span>
          <span class="form-label-hint">(minimum 2)</span>
        </label>

        <!-- Warning when removing choices in edit mode -->
        <Flex v-if="isRemovingChoices" gap="xs" y-center class="choices-warning mb-s">
          <Icon name="ph:warning" class="choices-warning__icon" />
          <p class="choices-warning__text">
            Removing choices will delete all existing votes cast on this item.
          </p>
        </Flex>

        <Flex gap="xs" y-center expand class="mb-xs">
          <Input
            v-model="newChoiceInput"
            expand
            name="new-choice"
            placeholder="Add a choice and press Enter"
            @keydown="handleChoiceKeydown"
          />
          <Button
            variant="accent"
            square
            :disabled="!newChoiceInput.trim()"
            @click="addChoice"
          >
            <Icon name="ph:plus" />
          </Button>
        </Flex>

        <Flex v-if="form.choices.length > 0" gap="xs" wrap class="mt-xs">
          <Badge
            v-for="(choice, index) in form.choices"
            :key="index"
            variant="neutral"
            size="s"
            class="choice-badge"
          >
            {{ choice }}
            <button class="choice-remove" type="button" @click="removeChoice(index)">
              <Icon name="ph:x" />
            </button>
          </Badge>
        </Flex>

        <span v-if="form.choices.length > 0 && !validation.choices" class="form-error mt-xs">
          At least 2 choices are required
        </span>
      </Flex>
    </Flex>

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

<style scoped lang="scss">
.form-label {
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
  margin-bottom: var(--space-xs);
  display: block;
}

.form-label-hint {
  font-weight: var(--font-weight-normal);
  color: var(--color-text-lighter);
  margin-left: var(--space-xs);
}

.form-required {
  color: var(--color-text-red);
}

.form-error {
  color: var(--color-text-red);
  font-size: var(--font-size-xs);
  margin-top: var(--space-xs);
  display: block;
}

.choices-warning {
  padding: var(--space-s) var(--space-m);
  background-color: var(--color-bg-lowered);
  border: 1px solid var(--color-text-red);
  border-radius: var(--border-radius-s);
  margin-bottom: var(--space-s);

  &__icon {
    color: var(--color-text-red);
    flex-shrink: 0;
  }

  &__text {
    font-size: var(--font-size-s);
    color: var(--color-text);
    margin: 0;
  }
}

.choice-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
}

.choice-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--color-text-lighter);
  line-height: 1;

  &:hover {
    color: var(--color-text-red);
  }
}

.mb-s {
  margin-bottom: var(--space-s);
}

.mb-l {
  margin-bottom: var(--space-l);
}

.mt-xs {
  margin-top: var(--space-xs);
}

.mb-xs {
  margin-bottom: var(--space-xs);
}

.error {
  border-color: var(--color-text-red) !important;
}
</style>
