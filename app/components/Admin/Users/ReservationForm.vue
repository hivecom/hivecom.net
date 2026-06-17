<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Button, Flex, Input, Sheet, Tooltip } from '@dolanske/vui'
import { watchDebounced } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'

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

const supabase = useSupabaseClient()

const USERNAME_RE = /^\w+$/

// Form state
const username = ref('')
const note = ref('')

// Assignee picker state
const assignee = ref<ProfileResult | null>(null)
const assigneeQuery = ref('')
const assigneeResults = ref<ProfileResult[]>([])
const assigneeLoading = ref(false)
const assigneeOpen = ref(false)

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
      assignee.value = reservation.assigned
      assigneeQuery.value = reservation.assigned?.username ?? ''
    }
    else {
      username.value = ''
      note.value = ''
      assignee.value = null
      assigneeQuery.value = ''
    }
    assigneeResults.value = []
    assigneeOpen.value = false
  },
  { immediate: true },
)

async function searchProfiles(term: string) {
  if (term.trim() === '') {
    assigneeResults.value = []
    assigneeOpen.value = false
    return
  }

  assigneeLoading.value = true
  try {
    const { data, error } = await supabase
      .rpc('search_profiles', { search_term: term })
      .select('id, username')
      .limit(10)

    if (error)
      throw error

    assigneeResults.value = (data ?? []) as ProfileResult[]
    assigneeOpen.value = assigneeResults.value.length > 0
  }
  catch {
    assigneeResults.value = []
    assigneeOpen.value = false
  }
  finally {
    assigneeLoading.value = false
  }
}

watchDebounced(assigneeQuery, (val) => {
  // Skip re-searching when the input still matches the confirmed selection.
  if (assignee.value !== null && val === assignee.value.username)
    return

  // Editing the input after confirming clears the selection.
  if (assignee.value !== null)
    assignee.value = null

  void searchProfiles(val)
}, { debounce: 250 })

function selectAssignee(profile: ProfileResult) {
  assignee.value = profile
  assigneeQuery.value = profile.username
  assigneeResults.value = []
  assigneeOpen.value = false
}

function clearAssignee() {
  assignee.value = null
  assigneeQuery.value = ''
  assigneeResults.value = []
  assigneeOpen.value = false
}

function onAssigneeBlur() {
  // Close on blur; @mousedown.prevent on the dropdown keeps option clicks alive.
  assigneeOpen.value = false
}

function onAssigneeFocus() {
  if (assigneeResults.value.length > 0)
    assigneeOpen.value = true
}

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
    assigned_to: assignee.value?.id ?? null,
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

        <Flex column gap="xs" expand class="reservation-form__assignee">
          <label class="reservation-form__label">Assigned to</label>
          <Input
            v-model="assigneeQuery"
            expand
            placeholder="Search a user (optional)..."
            :loading="assigneeLoading"
            autocomplete="off"
            @blur="onAssigneeBlur"
            @focus="onAssigneeFocus"
          >
            <template #start>
              <Icon name="ph:user" />
            </template>
            <template v-if="assignee" #end>
              <Button variant="gray" plain square size="s" @mousedown.prevent="clearAssignee">
                <Icon name="ph:x" size="14" />
              </Button>
            </template>
          </Input>

          <div
            v-if="assigneeOpen"
            class="reservation-form__dropdown"
            @mousedown.prevent
          >
            <button
              v-for="profile in assigneeResults"
              :key="profile.id"
              class="reservation-form__option"
              type="button"
              @click="selectAssignee(profile)"
            >
              <UserAvatar :user-id="profile.id" :size="22" />
              <span>{{ profile.username }}</span>
            </button>
          </div>

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

  &__assignee {
    position: relative;
  }

  &__dropdown {
    position: absolute;
    top: calc(100% + var(--space-xxs));
    left: 0;
    min-width: 100%;
    background-color: var(--color-bg-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-m);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    z-index: var(--z-popout);
    overflow: hidden;
  }

  &__option {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    width: 100%;
    padding: var(--space-xs) var(--space-s);
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    color: var(--color-text);
    font-size: var(--font-size-s);
    transition: background-color var(--transition-fast);

    &:hover {
      background-color: var(--color-bg-medium);
    }
  }
}

.form-actions {
  margin-top: var(--space);
}
</style>
