<script setup lang="ts">
import type { FormState } from '@/components/Events/EventFormFields.vue'
import type { Tables } from '@/types/database.overrides'
import { Button, Flex, Sheet, Tooltip } from '@dolanske/vui'
import { computed, onMounted, ref, watch } from 'vue'
import EventFormFields from '@/components/Events/EventFormFields.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import { CMS_BUCKET_ID } from '@/lib/storageAssets'
import { expandRecurringEvent } from '@/lib/utils/rrule'

const props = defineProps<{
  event: Tables<'events'> | null
  isEditMode: boolean
}>()

// Define emits
// NOTE: EventTable.vue only handles 'save' and 'delete'. When fork detection
// triggers, a 'fork' event is emitted. EventTable.vue needs a @fork handler
// to: (1) cap the existing event's recurrence_rule with UNTIL, and (2) insert
// the new event. Until that handler is added, fork submissions will be silently
// ignored by the parent.
const emit = defineEmits<{
  save: [eventData: object]
  delete: [id: number]
  fork: [payload: { oldId: number, cappedRule: string, newEventData: object }]
}>()

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// Get admin permissions
const { hasPermission } = useAdminPermissions()
const canDeleteEvents = computed(() => hasPermission('events.delete'))

// ── Form state ────────────────────────────────────────────────────────────────

const eventForm = ref({
  title: '',
  description: '',
  note: '',
  date: null as Date | null,
  duration_days: null as number | null,
  duration_hours: null as number | null,
  duration_minutes: null as number | null,
  location: '',
  link: '',
  markdown: '',
  games: [] as number[],
  is_official: false,
  recurrence_rule: '' as string | null,
  recurrence_exception: false,
})

// Bridge computed: maps between full eventForm and EventFormFields' FormState
const eventFormFields = computed<FormState>({
  get: () => ({
    title: eventForm.value.title,
    description: eventForm.value.description,
    note: eventForm.value.note,
    date: eventForm.value.date,
    duration_days: eventForm.value.duration_days,
    duration_hours: eventForm.value.duration_hours,
    duration_minutes: eventForm.value.duration_minutes,
    location: eventForm.value.location,
    link: eventForm.value.link,
    markdown: eventForm.value.markdown,
    recurrence_rule: eventForm.value.recurrence_rule ?? null,
    games: eventForm.value.games,
  }),
  set: (val) => {
    Object.assign(eventForm.value, val)
  },
})

// ── Validation ────────────────────────────────────────────────────────────────

const validation = computed(() => ({
  title: !!eventForm.value.title.trim(),
  description: !!eventForm.value.description.trim(),
  date: !!eventForm.value.date,
}))

const isValid = computed(() => Object.values(validation.value).every(Boolean))

// ── Delete state ──────────────────────────────────────────────────────────────

const showDeleteConfirm = ref(false)
const saveLoading = ref(false)
const deleteLoading = ref(false)

// ── Fork state ────────────────────────────────────────────────────────────────

const showForkConfirm = ref(false)
let pendingEventData: ReturnType<typeof buildEventData> | null = null

// ── Form data helpers ─────────────────────────────────────────────────────────

function updateFormData(newEvent: Tables<'events'> | null) {
  if (newEvent) {
    const totalMinutes = newEvent.duration_minutes || 0
    const days = Math.floor(totalMinutes / (24 * 60))
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
    const minutes = totalMinutes % 60

    eventForm.value = {
      title: newEvent.title,
      description: newEvent.description,
      note: newEvent.note || '',
      date: newEvent.date ? new Date(newEvent.date) : null,
      duration_days: days > 0 ? days : null,
      duration_hours: hours > 0 ? hours : null,
      duration_minutes: minutes > 0 ? minutes : null,
      location: newEvent.location || '',
      link: newEvent.link || '',
      markdown: newEvent.markdown || '',
      games: newEvent.games || [],
      is_official: newEvent.is_official ?? false,
      recurrence_rule: newEvent.recurrence_rule || '',
      recurrence_exception: newEvent.recurrence_exception ?? false,
    }
  }
  else {
    eventForm.value = {
      title: '',
      description: '',
      note: '',
      date: null,
      duration_days: null,
      duration_hours: null,
      duration_minutes: null,
      location: '',
      link: '',
      markdown: '',
      games: [],
      is_official: false,
      recurrence_rule: '',
      recurrence_exception: false,
    }
  }
}

watch(() => props.event, updateFormData)

onMounted(() => updateFormData(props.event))

// ── Build payload ─────────────────────────────────────────────────────────────

function buildEventData() {
  const totalDurationMinutes
    = (eventForm.value.duration_days || 0) * 24 * 60
      + (eventForm.value.duration_hours || 0) * 60
      + (eventForm.value.duration_minutes || 0)

  return {
    title: eventForm.value.title.trim(),
    description: eventForm.value.description.trim(),
    note: eventForm.value.note.trim() || null,
    date: eventForm.value.date ? eventForm.value.date.toISOString() : '',
    duration_minutes: totalDurationMinutes > 0 ? totalDurationMinutes : null,
    location: eventForm.value.location.trim() || null,
    link: eventForm.value.link.trim() || null,
    markdown: eventForm.value.markdown.trim() || null,
    games: eventForm.value.games.length > 0 ? eventForm.value.games : null,
    is_official: eventForm.value.is_official,
    recurrence_rule: (eventForm.value.recurrence_rule ?? '').trim() || null,
    recurrence_exception: eventForm.value.recurrence_exception,
  }
}

// ── Submit / fork ─────────────────────────────────────────────────────────────

function handleSubmit() {
  if (!isValid.value)
    return

  saveLoading.value = true

  // Fork detection: editing a recurring parent that has already started
  if (props.isEditMode && props.event && props.event.recurrence_rule) {
    const pastOccurrences = expandRecurringEvent(props.event, props.event.date, new Date())
    if (pastOccurrences.length > 0) {
      pendingEventData = buildEventData()
      showForkConfirm.value = true
      saveLoading.value = false
      return
    }
  }

  emit('save', buildEventData())
}

function doFork() {
  if (!props.event || !pendingEventData)
    return

  // Find the last past occurrence to determine where to cap the old series
  const pastOccurrences = expandRecurringEvent(props.event, props.event.date, new Date())
  const lastOccurrence = pastOccurrences.at(-1)

  if (!lastOccurrence) {
    // Fallback - no past occurrences found, just save normally
    emit('save', pendingEventData)
    pendingEventData = null
    return
  }

  // Format UNTIL as YYYYMMDDTHHmmssZ
  const untilDate = new Date(lastOccurrence.date)
  const pad = (n: number) => String(n).padStart(2, '0')
  const cappedRule = `${props.event.recurrence_rule};UNTIL=${untilDate.getUTCFullYear()}${pad(untilDate.getUTCMonth() + 1)}${pad(untilDate.getUTCDate())}T${pad(untilDate.getUTCHours())}${pad(untilDate.getUTCMinutes())}${pad(untilDate.getUTCSeconds())}Z`

  emit('fork', {
    oldId: props.event.id as number,
    cappedRule,
    newEventData: pendingEventData,
  })

  pendingEventData = null
}

// ── Delete ────────────────────────────────────────────────────────────────────

function handleDelete() {
  if (!props.event)
    return
  showDeleteConfirm.value = true
}

function confirmDelete() {
  if (!props.event)
    return
  deleteLoading.value = true
  emit('delete', props.event.id)
}

// ── UI helpers ─────────────────────────────────────────────────────────────────

function handleClose() {
  isOpen.value = false
}

const formTitle = computed(() => props.isEditMode ? 'Edit Event' : 'Add Event')
const submitButtonText = computed(() => props.isEditMode ? 'Update Event' : 'Create Event')
</script>

<template>
  <Sheet
    :open="isOpen"
    position="right"
    :card="{ separators: true }"
    :size="700"
    @close="handleClose"
  >
    <template #header>
      <Flex column :gap="0">
        <h4>{{ formTitle }}</h4>
        <p v-if="props.isEditMode && props.event" class="text-color-light text-xs">
          {{ props.event.title }}
        </p>
      </Flex>
    </template>

    <EventFormFields
      v-model="eventFormFields"
      v-model:is-official="eventForm.is_official"
      v-model:recurrence-exception="eventForm.recurrence_exception"
      :is-privileged="true"
      :is-edit-mode="props.isEditMode"
      :event-id="props.event?.id?.toString() ?? undefined"
      :show-recurrence-builder="!props.event?.recurrence_parent_id"
      :show-recurrence-exception="props.isEditMode && !!props.event?.recurrence_parent_id"
      :validation="validation"
      :media-bucket-id="CMS_BUCKET_ID"
    />

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

        <Tooltip v-if="isEditMode && canDeleteEvents">
          <Button
            variant="danger"
            square
            :loading="deleteLoading"
            @click.prevent="handleDelete"
          >
            <Icon name="ph:trash" />
          </Button>
          <template #tooltip>
            <p>Delete event</p>
          </template>
        </Tooltip>
      </Flex>
    </template>
  </Sheet>

  <!-- Delete Confirmation Modal -->
  <ConfirmModal
    v-if="props.event"
    v-model:open="showDeleteConfirm"
    :confirm="confirmDelete"
    title="Delete Event"
    :description="`Are you sure you want to delete '${props.event.title}'? This action cannot be undone.`"
    confirm-text="Delete"
    cancel-text="Cancel"
    :destructive="true"
  />

  <!-- Fork Confirmation Modal -->
  <ConfirmModal
    v-model:open="showForkConfirm"
    title="This event has already occurred"
    description="Your changes will create a new series starting from the next occurrence. The previous series will be preserved with its existing RSVPs."
    confirm-text="Create new series"
    @confirm="doFork"
  />
</template>

<style lang="scss" scoped>
.form-actions {
  margin-top: var(--space);
}

.flex-1 {
  flex: 1;
}
</style>
