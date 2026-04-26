<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Button, Calendar, Flex, Grid, Input, Modal, Select, Switch, Tooltip } from '@dolanske/vui'
import { computed, nextTick, ref, watch } from 'vue'
import RichTextEditor from '@/components/Editor/RichTextEditor.vue'
import RecurrenceBuilder from '@/components/Events/RecurrenceBuilder.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import { useDataGames } from '@/composables/useDataGames'
import { useDataUser } from '@/composables/useDataUser'

const props = defineProps<{
  event?: Tables<'events'> | null
}>()

const emit = defineEmits<{
  saved: []
}>()

const open = defineModel<boolean>('open')

// Games data
const { games, loading: loadingGames } = useDataGames()

interface SelectOption {
  label: string
  value: number
}

const gameOptions = computed(() =>
  games.value.map(game => ({
    label: game.name ?? 'Unknown Game',
    value: game.id,
  })),
)

const selectedGames = ref<SelectOption[]>([])

// Form state
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
  recurrence_rule: null as string | null,
  is_official: false,
})

const saveLoading = ref(false)
const saveError = ref<string | null>(null)

const deleteLoading = ref(false)
const deleteError = ref<string | null>(null)
const showDeleteConfirm = ref(false)

// Computed
const isEditMode = computed(() => !!props.event)

// Validation
const validation = computed(() => ({
  title: !!eventForm.value.title.trim(),
  description: !!eventForm.value.description.trim(),
  date: !!eventForm.value.date,
}))

const isValid = computed(() => Object.values(validation.value).every(Boolean))

// Watch selectedGames -> sync to form games array (kept separate for submit)
const formGames = ref<number[]>([])
watch(selectedGames, (newVal) => {
  formGames.value = Array.isArray(newVal) ? newVal.map(o => o.value) : []
}, { deep: true })

// Helper to sync selectedGames from formGames (used after populate)
function syncSelectedGames() {
  selectedGames.value = gameOptions.value.filter(option =>
    formGames.value.includes(option.value),
  )
}

// When games finish loading, re-sync
watch(() => loadingGames.value, (isLoading) => {
  if (!isLoading) {
    nextTick(() => {
      if (isEditMode.value && props.event) {
        syncSelectedGames()
      }
      else {
        selectedGames.value = []
        formGames.value = []
      }
    })
  }
})

function populateForm(event: Tables<'events'>) {
  const totalMinutes = event.duration_minutes ?? 0
  const days = Math.floor(totalMinutes / (24 * 60))
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
  const minutes = totalMinutes % 60

  eventForm.value = {
    title: event.title ?? '',
    description: event.description ?? '',
    note: event.note ?? '',
    date: event.date ? new Date(event.date) : null,
    duration_days: days > 0 ? days : null,
    duration_hours: hours > 0 ? hours : null,
    duration_minutes: minutes > 0 ? minutes : null,
    location: event.location ?? '',
    link: event.link ?? '',
    markdown: event.markdown ?? '',
    recurrence_rule: event.recurrence_rule ?? null,
    is_official: event.is_official ?? false,
  }

  formGames.value = Array.isArray(event.games) ? (event.games as number[]) : []
  syncSelectedGames()
  saveError.value = null
  deleteError.value = null
}

function resetForm() {
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
    recurrence_rule: null,
    is_official: false,
  }
  selectedGames.value = []
  formGames.value = []
  saveError.value = null
  deleteError.value = null
  showDeleteConfirm.value = false
}

function handleClose() {
  open.value = false
}

watch(open, (val) => {
  if (val) {
    if (isEditMode.value && props.event) {
      populateForm(props.event)
    }
    else {
      resetForm()
    }
  }
  else {
    resetForm()
  }
})

// Also re-populate when the event prop changes while modal is open
watch(() => props.event, (event) => {
  if (open.value && event) {
    populateForm(event)
  }
})

// Auth
const supabase = useSupabaseClient()
const userId = useUserId()
const { user: currentUserData } = useDataUser(userId, { includeRole: true, includeAvatar: false })
const isPrivileged = computed(() => {
  const role = currentUserData.value?.role
  return role === 'admin' || role === 'moderator'
})

const canDelete = computed(() => {
  if (!props.event || !userId.value)
    return false
  const isOwner = props.event.created_by === userId.value && !props.event.is_official
  return isOwner || isPrivileged.value
})

async function handleSubmit() {
  if (!isValid.value)
    return

  saveLoading.value = true
  saveError.value = null

  try {
    const totalDurationMinutes
      = (eventForm.value.duration_days ?? 0) * 24 * 60
        + (eventForm.value.duration_hours ?? 0) * 60
        + (eventForm.value.duration_minutes ?? 0)

    const payload = {
      title: eventForm.value.title.trim(),
      description: eventForm.value.description.trim(),
      note: eventForm.value.note.trim() || null,
      date: eventForm.value.date!.toISOString(),
      duration_minutes: totalDurationMinutes > 0 ? totalDurationMinutes : null,
      location: eventForm.value.location.trim() || null,
      link: eventForm.value.link.trim() || null,
      markdown: eventForm.value.markdown.trim() || null,
      recurrence_rule: eventForm.value.recurrence_rule || null,
      is_official: isPrivileged.value ? eventForm.value.is_official : undefined,
      games: formGames.value.length > 0 ? formGames.value : null,
      modified_by: userId.value,
      modified_at: new Date().toISOString(),
    }

    if (isEditMode.value && props.event) {
      const { error } = await supabase
        .from('events')
        .update(payload)
        .eq('id', props.event.id)

      if (error)
        throw error
    }
    else {
      const { error } = await supabase.from('events').insert({
        ...payload,
        is_official: isPrivileged.value ? eventForm.value.is_official : false,
        created_by: userId.value,
      })

      if (error)
        throw error
    }

    open.value = false
    emit('saved')
  }
  catch (err) {
    saveError.value = err instanceof Error
      ? err.message
      : isEditMode.value
        ? 'Failed to update event. Please try again.'
        : 'Failed to create event. Please try again.'
  }
  finally {
    saveLoading.value = false
  }
}

async function handleDelete() {
  if (!props.event)
    return

  deleteLoading.value = true
  deleteError.value = null

  try {
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', props.event.id)

    if (error)
      throw error

    open.value = false
    emit('saved')
    await navigateTo('/events')
  }
  catch (err) {
    deleteError.value = err instanceof Error ? err.message : 'Failed to delete event. Please try again.'
    showDeleteConfirm.value = false
  }
  finally {
    deleteLoading.value = false
  }
}
</script>

<template>
  <Modal
    :open="open"
    size="l"
    :card="{ separators: true }"
    :can-dismiss="false"
    @close="handleClose"
  >
    <template #header>
      <Flex column :gap="0">
        <h4>{{ isEditMode ? 'Edit Event' : 'Create Event' }}</h4>
        <p class="text-color-light text-xs">
          {{ isEditMode ? props.event?.title : 'Submit a community event' }}
        </p>
      </Flex>
    </template>

    <!-- Form -->
    <Flex column gap="l" class="create-event-form">
      <h4>Basic Information</h4>

      <Switch
        v-if="isPrivileged"
        v-model="eventForm.is_official"
        label="Official Event"
        hint="All events are synced to Discord. Official events sync to the official Google Calendar, non-official events to the community Google Calendar."
      />

      <Input
        v-model="eventForm.title"
        expand
        name="title"
        label="Title"
        required
        :valid="validation.title"
        error="Title is required"
        placeholder="Enter event title"
      />

      <!-- Date picker -->
      <Grid expand>
        <div class="create-event-form__date-picker-container">
          <label for="date-picker" class="create-event-form__date-picker-label">
            Date <span style="color: var(--color-text-red);">*</span>
          </label>
          <Calendar
            v-model="eventForm.date"
            expand
            enable-time-picker
            time-picker-inline
            enable-minutes
            enable-seconds
            is24
            format="yyyy-MM-dd-HH:mm"
            :class="{ invalid: !validation.date }"
          >
            <template #trigger>
              <Button
                id="date-picker"
                class="create-event-form__date-picker-button"
                expand
                :class="{ error: !validation.date }"
              >
                {{ eventForm.date ? eventForm.date.toLocaleString('en-US', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                }) : 'Choose date and time' }}
                <template #end>
                  <Icon name="ph:calendar" />
                </template>
              </Button>
            </template>
          </Calendar>
          <span v-if="!validation.date" class="text-xs text-color-red">Date is required</span>
        </div>
      </Grid>

      <!-- Duration -->
      <Flex column gap="s" expand>
        <div class="create-event-form__section-label">
          Duration
        </div>
        <Grid :columns="3" gap="xs" expand>
          <Input
            style="width: auto;"
            name="duration_days"
            type="number"
            placeholder="Days"
            :min="0"
            :model-value="eventForm.duration_days?.toString() ?? ''"
            @update:model-value="eventForm.duration_days = $event ? Number($event) : null"
          />
          <Input
            expand
            name="duration_hours"
            type="number"
            placeholder="Hours"
            :min="0"
            :max="23"
            :model-value="eventForm.duration_hours?.toString() ?? ''"
            @update:model-value="eventForm.duration_hours = $event ? Number($event) : null"
          />
          <Input
            expand
            name="duration_minutes"
            type="number"
            placeholder="Minutes"
            :min="0"
            :max="59"
            :model-value="eventForm.duration_minutes?.toString() ?? ''"
            @update:model-value="eventForm.duration_minutes = $event ? Number($event) : null"
          />
        </Grid>
      </Flex>

      <RecurrenceBuilder v-model="eventForm.recurrence_rule" />

      <Input
        v-model="eventForm.description"
        expand
        name="description"
        label="Description"
        required
        :valid="validation.description"
        error="Description is required"
        placeholder="Enter event description"
      />

      <Input
        v-model="eventForm.note"
        expand
        name="note"
        label="Note"
        placeholder="Short note about the event (optional)"
      />

      <!-- Games -->
      <Select
        v-model="selectedGames"
        :single="false"
        expand
        :options="gameOptions"
        :disabled="loadingGames"
        label="Games"
        placeholder="Select associated games (optional)"
        search
        show-clear
      />

      <!-- Content / Markdown -->
      <RichTextEditor
        v-model="eventForm.markdown"
        label="Content"
        hint="You can use markdown and add media by drag-and-drop"
        placeholder="Additional event details (optional)"
        min-height="144px"
        show-expand-button
        :media-context="props.event?.id ? `events/${props.event.id}/markdown/media` : undefined"
        :show-attachment-button="!!props.event?.id"
      />

      <Input
        v-model="eventForm.location"
        expand
        name="location"
        label="Location"
        placeholder="Enter event location (optional)"
      />

      <Input
        v-model="eventForm.link"
        expand
        name="link"
        type="url"
        label="Link"
        placeholder="https://example.com (optional)"
      />

      <!-- Save error -->
      <p v-if="saveError" class="text-xs text-color-red">
        {{ saveError }}
      </p>
    </Flex>

    <template #footer>
      <Flex gap="xs" x-between expand>
        <Flex gap="xs">
          <Tooltip v-if="isEditMode && canDelete">
            <Button
              variant="danger"
              square
              :loading="deleteLoading"
              @click="showDeleteConfirm = true"
            >
              <Icon name="ph:trash" />
            </Button>
            <template #tooltip>
              <p>Delete event</p>
            </template>
          </Tooltip>
        </Flex>

        <Flex gap="xs">
          <Button plain @click.prevent="handleClose">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="accent"
            :disabled="!isValid"
            :loading="saveLoading"
            @click.prevent="handleSubmit"
          >
            {{ isEditMode ? 'Save changes' : 'Create event' }}
          </Button>
        </Flex>
      </Flex>
    </template>
  </Modal>

  <ConfirmModal
    v-if="isEditMode && props.event != null"
    v-model:open="showDeleteConfirm"
    :confirm-loading="deleteLoading"
    title="Delete event"
    :description="`Are you sure you want to delete '${props.event?.title}'? This cannot be undone.`"
    confirm-text="Delete"
    :destructive="true"
    @confirm="handleDelete"
  />
</template>

<style lang="scss" scoped>
.create-event-form {
  padding-bottom: var(--space);

  &__date-picker-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  &__date-picker-label {
    font-size: var(--font-size-s);
    font-weight: var(--font-weight-medium);
    color: var(--color-text);
  }

  &__section-label {
    font-size: var(--font-size-s);
    font-weight: var(--font-weight-medium);
    color: var(--color-text);
  }
}
</style>
