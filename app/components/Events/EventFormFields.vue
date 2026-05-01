<script setup lang="ts">
import type { StorageBucketId } from '@/lib/storageAssets'
import { Button, Calendar, Flex, Grid, Input, Select, Switch } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import RichTextEditor from '@/components/Editor/RichTextEditor.vue'
import RecurrenceBuilder from '@/components/Events/RecurrenceBuilder.vue'
import { useDataGames } from '@/composables/useDataGames'
import { useBreakpoint } from '@/lib/mediaQuery'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FormState {
  title: string
  description: string
  note: string
  date: Date | null
  duration_days: number | null
  duration_hours: number | null
  duration_minutes: number | null
  location: string
  link: string
  markdown: string
  recurrence_rule: string | null
  games: number[]
}

interface SelectOption {
  label: string
  value: number
}

// ── Props / Emits ──────────────────────────────────────────────────────────────

const props = withDefaults(defineProps<{
  modelValue: FormState
  isPrivileged?: boolean
  isOfficial?: boolean
  isEditMode?: boolean
  eventId?: string
  showRecurrenceBuilder?: boolean
  showRecurrenceException?: boolean
  recurrenceException?: boolean
  mediaBucketId?: StorageBucketId
  validation?: { title: boolean, description: boolean, date: boolean }
}>(), {
  isPrivileged: false,
  isOfficial: false,
  isEditMode: false,
  eventId: undefined,
  showRecurrenceBuilder: true,
  showRecurrenceException: false,
  recurrenceException: false,
  mediaBucketId: undefined as StorageBucketId | undefined,
  validation: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [value: FormState]
  'update:isOfficial': [value: boolean]
  'update:recurrenceException': [value: boolean]
}>()

// ── Responsive ─────────────────────────────────────────────────────────────────

const isBelowMedium = useBreakpoint('<m')

// ── Games ──────────────────────────────────────────────────────────────────────

const { games, loading: loadingGames } = useDataGames()

const gameOptions = computed<SelectOption[]>(() =>
  games.value.map(game => ({
    label: game.name ?? 'Unknown Game',
    value: game.id,
  })),
)

const selectedGames = ref<SelectOption[]>([])

// Sync selectedGames from the current modelValue.games + gameOptions.
// Called on mount and whenever gameOptions become available.
function syncSelectedGames() {
  selectedGames.value = gameOptions.value.filter(opt =>
    props.modelValue.games.includes(opt.value),
  )
}

// On mount: games may already be cached and gameOptions populated.
onMounted(() => {
  if (gameOptions.value.length > 0)
    syncSelectedGames()
})

// Games finished loading (async path) -> sync
watch(gameOptions, (opts) => {
  if (opts.length > 0)
    syncSelectedGames()
})

// modelValue.games changed externally (form reset / populate) -> re-sync
// Only runs when gameOptions are already available.
watch(
  () => props.modelValue.games,
  () => {
    if (gameOptions.value.length > 0)
      syncSelectedGames()
  },
  { deep: true },
)

// selectedGames changed by user -> propagate up
watch(selectedGames, (newVal) => {
  const gameIds = Array.isArray(newVal) ? newVal.map(o => o.value) : []
  // Skip if it already matches to avoid a spurious emit during sync
  const same = gameIds.length === props.modelValue.games.length
    && gameIds.every(id => props.modelValue.games.includes(id))
  if (!same)
    emit('update:modelValue', { ...props.modelValue, games: gameIds })
}, { deep: true })

// ── Field helpers ──────────────────────────────────────────────────────────────

function update<K extends keyof FormState>(key: K, value: FormState[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

// ── Local date ref ─────────────────────────────────────────────────────────────
// Calendar emits on every intermediate interaction (hour/minute scroll).
// Binding it directly to modelValue via update() creates a re-render cycle:
// emit -> parent sets new modelValue object -> Calendar gets new :model-value -> emits again.
// Fix: keep a local ref that Calendar owns; only propagate outward when the
// date value actually changes (compared by time), and only pull inward when
// the parent sets a genuinely different date.

const localDate = ref<Date | null>(props.modelValue.date)

watch(
  () => props.modelValue.date,
  (incoming) => {
    const inMs = incoming?.getTime() ?? null
    const localMs = localDate.value?.getTime() ?? null
    if (inMs !== localMs)
      localDate.value = incoming
  },
)

function onDateUpdate(val: Date | null) {
  localDate.value = val
  const inMs = val?.getTime() ?? null
  const currentMs = props.modelValue.date?.getTime() ?? null
  if (inMs !== currentMs)
    emit('update:modelValue', { ...props.modelValue, date: val })
}

// ── Computed validation (fallback all-true when not provided) ──────────────────

const effectiveValidation = computed(() =>
  props.validation ?? { title: true, description: true, date: true },
)

// ── Media context ──────────────────────────────────────────────────────────────

const mediaContext = computed(() =>
  props.eventId ? `events/${props.eventId}/markdown/media` : undefined,
)
</script>

<template>
  <Flex column gap="l" class="event-form-fields">
    <!-- Official event toggle - privileged only -->
    <Switch
      v-if="isPrivileged"
      :model-value="isOfficial"
      label="Official Event"
      hint="All events are synced to Discord. Official events sync to the official Google Calendar, non-official events to the community Google Calendar."
      @update:model-value="emit('update:isOfficial', $event)"
    />

    <!-- Title -->
    <Input
      :model-value="modelValue.title"
      expand
      name="title"
      label="Title"
      required
      :valid="effectiveValidation.title"
      error="Title is required"
      placeholder="Enter event title"
      @update:model-value="update('title', String($event))"
    />

    <!-- Date picker -->
    <Grid expand>
      <div class="event-form-fields__date-picker-container">
        <label for="event-date-picker" class="event-form-fields__label">
          Date <span style="color: var(--color-text-red);">*</span>
        </label>
        <Calendar
          :model-value="localDate"
          expand
          enable-time-picker
          time-picker-inline
          enable-minutes
          enable-seconds
          is24
          format="yyyy-MM-dd-HH:mm"
          :class="{ invalid: !effectiveValidation.date }"
          @update:model-value="onDateUpdate($event)"
        >
          <template #trigger>
            <Button
              id="event-date-picker"
              class="event-form-fields__date-picker-button"
              expand
              :class="{ error: !effectiveValidation.date }"
            >
              {{ localDate ? localDate.toLocaleString('en-US', {
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
        <span v-if="!effectiveValidation.date" class="text-xs text-color-red">Date is required</span>
      </div>
    </Grid>

    <!-- Duration -->
    <Flex column gap="s" expand>
      <div class="event-form-fields__label">
        Duration
      </div>
      <Grid :columns="isBelowMedium ? 1 : 3" gap="xs" expand>
        <Input
          style="width: auto;"
          name="duration_days"
          type="number"
          placeholder="Days"
          :min="0"
          :model-value="modelValue.duration_days?.toString() ?? ''"
          @update:model-value="update('duration_days', $event ? Number(String($event)) : null)"
        />
        <Input
          expand
          name="duration_hours"
          type="number"
          placeholder="Hours"
          :min="0"
          :max="23"
          :model-value="modelValue.duration_hours?.toString() ?? ''"
          @update:model-value="update('duration_hours', $event ? Number(String($event)) : null)"
        />
        <Input
          expand
          name="duration_minutes"
          type="number"
          placeholder="Minutes"
          :min="0"
          :max="59"
          :model-value="modelValue.duration_minutes?.toString() ?? ''"
          @update:model-value="update('duration_minutes', $event ? Number(String($event)) : null)"
        />
      </Grid>
    </Flex>

    <!-- Recurrence builder -->
    <RecurrenceBuilder
      v-if="showRecurrenceBuilder"
      :model-value="modelValue.recurrence_rule"
      :event-date="modelValue.date"
      @update:model-value="update('recurrence_rule', $event)"
    />
    <Switch
      v-if="showRecurrenceException"
      :model-value="recurrenceException"
      label="Mark as exception"
      hint="Override this single occurrence within the recurring series."
      @update:model-value="emit('update:recurrenceException', $event)"
    />

    <!-- Description -->
    <Input
      :model-value="modelValue.description"
      expand
      name="description"
      label="Description"
      required
      :valid="effectiveValidation.description"
      error="Description is required"
      placeholder="Enter event description"
      @update:model-value="update('description', String($event))"
    />

    <!-- Note -->
    <Input
      :model-value="modelValue.note"
      expand
      name="note"
      label="Note"
      placeholder="Short note about the event (optional)"
      @update:model-value="update('note', String($event))"
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

    <!-- Rich text content -->
    <RichTextEditor
      :model-value="modelValue.markdown"
      label="Content"
      hint="You can use markdown and add media by drag-and-drop"
      placeholder="Additional event details (optional)"
      min-height="144px"
      show-expand-button
      :media-context="mediaContext"
      :media-bucket-id="mediaBucketId"
      :show-attachment-button="!!eventId && isEditMode"
      @update:model-value="update('markdown', $event ?? '')"
    />

    <!-- Location -->
    <Input
      :model-value="modelValue.location"
      expand
      name="location"
      label="Location"
      placeholder="Enter event location (optional)"
      @update:model-value="update('location', String($event))"
    />

    <!-- Link -->
    <Input
      :model-value="modelValue.link"
      expand
      name="link"
      type="url"
      label="Link"
      placeholder="https://example.com (optional)"
      @update:model-value="update('link', String($event))"
    />
  </Flex>
</template>

<style lang="scss" scoped>
.event-form-fields {
  &__date-picker-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  &__label {
    font-size: var(--font-size-s);
    font-weight: var(--font-weight-medium);
    color: var(--color-text);
  }
}
</style>
