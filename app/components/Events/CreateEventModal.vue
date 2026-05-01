<script setup lang="ts">
import type { FormState } from '@/components/Events/EventFormFields.vue'
import type { Tables } from '@/types/database.overrides'
import { Button, Flex, Modal, Tooltip } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import EventFormFields from '@/components/Events/EventFormFields.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import { useDataUser } from '@/composables/useDataUser'
import { expandRecurringEvent } from '@/lib/utils/rrule'

const props = defineProps<{
  event?: Tables<'events'> | null
}>()

const emit = defineEmits<{
  saved: []
}>()

const open = defineModel<boolean>('open')

// Form state
const eventForm = ref<FormState>({
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
  games: [],
})

const isOfficial = ref(false)

const saveLoading = ref(false)
const saveError = ref<string | null>(null)

const deleteLoading = ref(false)
const deleteError = ref<string | null>(null)
const showDeleteConfirm = ref(false)
const showForkConfirm = ref(false)

// Computed
const isEditMode = computed(() => !!props.event)

// Validation
const validation = computed(() => ({
  title: !!eventForm.value.title.trim(),
  description: !!eventForm.value.description.trim(),
  date: !!eventForm.value.date,
}))

const isValid = computed(() => Object.values(validation.value).every(Boolean))

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
    games: Array.isArray(event.games) ? (event.games as number[]) : [],
  }

  isOfficial.value = event.is_official ?? false
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
    games: [],
  }
  isOfficial.value = false
  saveError.value = null
  deleteError.value = null
  showDeleteConfirm.value = false
  showForkConfirm.value = false
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

function buildPayload() {
  const totalDurationMinutes
    = (eventForm.value.duration_days ?? 0) * 24 * 60
      + (eventForm.value.duration_hours ?? 0) * 60
      + (eventForm.value.duration_minutes ?? 0)

  return {
    title: eventForm.value.title.trim(),
    description: eventForm.value.description.trim(),
    note: eventForm.value.note.trim() || null,
    date: eventForm.value.date!.toISOString(),
    duration_minutes: totalDurationMinutes > 0 ? totalDurationMinutes : null,
    location: eventForm.value.location.trim() || null,
    link: eventForm.value.link.trim() || null,
    markdown: eventForm.value.markdown.trim() || null,
    recurrence_rule: eventForm.value.recurrence_rule || null,
    is_official: isPrivileged.value ? isOfficial.value : undefined,
    games: eventForm.value.games.length > 0 ? eventForm.value.games : null,
    modified_by: userId.value,
    modified_at: new Date().toISOString(),
  }
}

async function handleSubmit() {
  if (!isValid.value)
    return

  // Fork detection: if editing a recurring event that has already had occurrences
  if (isEditMode.value && props.event && props.event.recurrence_rule) {
    const now = new Date()
    const occurrences = expandRecurringEvent(props.event, new Date(props.event.date), now)
    if (occurrences.length >= 1) {
      showForkConfirm.value = true
      return
    }
  }

  await doSave()
}

async function doSave() {
  saveLoading.value = true
  saveError.value = null

  try {
    const payload = buildPayload()

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
        is_official: isPrivileged.value ? isOfficial.value : false,
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

async function doFork() {
  if (!props.event)
    return

  saveLoading.value = true
  saveError.value = null

  try {
    const now = new Date()
    const payload = buildPayload()

    // Find last occurrence before now
    const pastOccurrences = expandRecurringEvent(props.event, new Date(props.event.date), now)
    const lastOccurrence = pastOccurrences[pastOccurrences.length - 1]
    if (!lastOccurrence)
      throw new Error('No past occurrences found to fork from')

    // Cap old event's recurrence_rule with UNTIL
    const pad = (n: number) => String(n).padStart(2, '0')
    const lu = new Date(lastOccurrence.date)
    const untilStr = `${lu.getUTCFullYear()}${pad(lu.getUTCMonth() + 1)}${pad(lu.getUTCDate())}T${pad(lu.getUTCHours())}${pad(lu.getUTCMinutes())}${pad(lu.getUTCSeconds())}Z`
    const cappedRule = `${props.event.recurrence_rule};UNTIL=${untilStr}`

    const { error: capError } = await supabase
      .from('events')
      .update({ recurrence_rule: cappedRule })
      .eq('id', props.event.id)

    if (capError)
      throw capError

    // Insert new forked event - use the user's chosen date/time from the form
    // as the new series start date, not the computed next old occurrence.
    const { error: insertError } = await supabase.from('events').insert({
      ...payload,
      is_official: isPrivileged.value ? isOfficial.value : false,
      created_by: userId.value,
    })

    if (insertError)
      throw insertError

    open.value = false
    emit('saved')
  }
  catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Failed to fork event. Please try again.'
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
    <EventFormFields
      v-model="eventForm"
      v-model:is-official="isOfficial"
      :is-privileged="isPrivileged"
      :is-edit-mode="isEditMode"
      :event-id="props.event?.id?.toString()"
      :validation="validation"
    />

    <!-- Save error -->
    <p v-if="saveError" class="text-xs text-color-red">
      {{ saveError }}
    </p>

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

  <ConfirmModal
    v-model:open="showForkConfirm"
    title="This event has already occurred"
    description="Your changes will create a new series starting from the next occurrence. The previous series will be preserved with its existing RSVPs."
    confirm-text="Create new series"
    @confirm="doFork"
  />
</template>

<style lang="scss" scoped>
.text-color-red {
  color: var(--color-text-red);
  padding-bottom: var(--space);
}
</style>
