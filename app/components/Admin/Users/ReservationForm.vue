<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Button, Flex, Input, Sheet, Tooltip } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import ProfileSelect from '@/components/Shared/ProfileSelect.vue'

type Reservation = Tables<'profile_reservations'>

interface ProfileResult {
  id: string
  username: string
}

interface ReservationRow extends Reservation {
  assigned: ProfileResult | null
}

const props = defineProps<{
  reservation: ReservationRow | null
  isEditMode: boolean
}>()

const emit = defineEmits<{
  save: [data: { username: string, note: string | null, assigned_to: string | null }]
  delete: [id: number]
}>()

const isOpen = defineModel<boolean>('isOpen')

const USERNAME_RE = /^\w+$/

// Form state
const username = ref('')
const note = ref('')
const assignedTo = ref<string | null>(null)

const showDeleteConfirm = ref(false)
const saveLoading = ref(false)

const usernameError = computed(() => {
  const value = username.value.trim()
  if (!value)
    return 'Username is required'
  if (value.length < 3)
    return 'Username must be at least 3 characters long'
  if (value.length > 32)
    return 'Username must be 32 characters or less'
  if (!USERNAME_RE.test(value))
    return 'Username can only contain letters, numbers, and underscores'
  return ''
})

const isValid = computed(() => usernameError.value === '')

// Populate fields when the edited reservation changes, reset when adding.
watch(
  () => props.reservation,
  (reservation) => {
    if (reservation) {
      username.value = reservation.username
      note.value = reservation.note ?? ''
      assignedTo.value = reservation.assigned?.id ?? null
    }
    else {
      username.value = ''
      note.value = ''
      assignedTo.value = null
    }
  },
  { immediate: true },
)

function handleClose() {
  isOpen.value = false
}

function handleSubmit() {
  if (!isValid.value)
    return

  saveLoading.value = true
  emit('save', {
    username: username.value.trim(),
    note: note.value.trim() || null,
    assigned_to: assignedTo.value,
  })
}

watch(isOpen, (open) => {
  if (!open)
    saveLoading.value = false
})

function handleDelete() {
  if (!props.reservation)
    return
  showDeleteConfirm.value = true
}

function confirmDelete() {
  if (!props.reservation)
    return
  emit('delete', props.reservation.id)
}
</script>

<template>
  <Sheet
    :open="isOpen"
    position="right"
    :card="{ separators: true }"
    :size="600"
    @close="handleClose"
  >
    <template #header>
      <Flex y-center gap="m" class="pr-s">
        <Flex column :gap="0">
          <h4>{{ props.isEditMode ? 'Edit Reservation' : 'Add Reservation' }}</h4>
          <p v-if="props.isEditMode && props.reservation" class="text-color-light text-xs">
            {{ props.reservation.username }}
          </p>
        </Flex>
      </Flex>
    </template>

    <Flex column gap="l" class="reservation-form">
      <Flex column gap="m" expand>
        <h4>Reservation Information</h4>

        <Input
          v-model="username"
          expand
          name="username"
          label="Username"
          required
          :valid="isValid || username.trim() === ''"
          :error="usernameError"
          placeholder="Reserved username"
        />

        <Input
          v-model="note"
          expand
          name="note"
          label="Note"
          placeholder="Admin context (optional), e.g. legacy IRC owner"
        />

        <Flex column gap="xs" expand>
          <label class="reservation-form__label">Assigned to</label>
          <ProfileSelect
            v-model="assignedTo"
            placeholder="Search a user (optional)..."
            expand
          />
          <span class="text-xs text-color-lighter">
            Leave empty to block the username for everyone. Assign a user to let only them take it.
          </span>
        </Flex>
      </Flex>
    </Flex>

    <template #footer>
      <Flex gap="xs" class="form-actions">
        <Button
          type="submit"
          variant="accent"
          :disabled="!isValid || saveLoading"
          :loading="saveLoading"
          @click.prevent="handleSubmit"
        >
          <template #start>
            <Icon name="ph:check" />
          </template>
          {{ props.isEditMode ? 'Update' : 'Create' }}
        </Button>

        <Button @click.prevent="handleClose">
          Cancel
        </Button>

        <div class="flex-1" />

        <Tooltip v-if="props.isEditMode">
          <Button
            variant="danger"
            square
            @click.prevent="handleDelete"
          >
            <Icon name="ph:trash" />
          </Button>
          <template #tooltip>
            <p>Delete reservation</p>
          </template>
        </Tooltip>
      </Flex>
    </template>

    <ConfirmModal
      v-model:open="showDeleteConfirm"
      :confirm="confirmDelete"
      title="Confirm Delete Reservation"
      :description="`Are you sure you want to delete the reservation for '${props.reservation?.username}'? This action cannot be undone.`"
      confirm-text="Delete"
      cancel-text="Cancel"
      :destructive="true"
    />
  </Sheet>
</template>

<style lang="scss" scoped>
.reservation-form {
  padding-bottom: var(--space);

  &__label {
    font-size: var(--font-size-s);
    font-weight: var(--font-weight-medium);
    color: var(--color-text);
  }
}

.form-actions {
  margin-top: var(--space);
}
</style>
