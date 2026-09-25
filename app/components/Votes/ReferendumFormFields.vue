<script setup lang="ts">
import type { ReferendumFormState, ReferendumFormValidation } from '@/lib/referendums'
import { Badge, Button, Calendar, Checkbox, Flex, Grid, Input, Textarea, Tooltip } from '@dolanske/vui'
import { computed, ref } from 'vue'
import { useFieldUpdate } from '@/composables/useFieldUpdate'
import { useBreakpoint } from '@/lib/mediaQuery'
import { displayDateTime } from '@/lib/utils/date'

const props = withDefaults(defineProps<{
  modelValue: ReferendumFormState
  validation: ReferendumFormValidation
  canMakePublic?: boolean
  // Choices saved on the row being edited. Removing one of them wipes its votes.
  originalChoices?: string[]
}>(), {
  canMakePublic: false,
  originalChoices: () => [],
})

const emit = defineEmits<{
  'update:modelValue': [value: ReferendumFormState]
}>()

const isMobile = useBreakpoint('<s')

const update = useFieldUpdate(() => props.modelValue, value => emit('update:modelValue', value))

// Calendar emits on every hour and minute scroll. Only propagate a real change,
// otherwise the new modelValue object feeds back into Calendar and it emits again.
function onDateUpdate(key: 'date_start' | 'date_end', value: Date | null) {
  const incoming = value?.getTime() ?? null
  const current = props.modelValue[key]?.getTime() ?? null

  if (incoming !== current)
    update(key, value)
}

// The end date only turns red once someone has opened its picker
const endTouched = ref(false)

const endDateInvalid = computed(() =>
  endTouched.value
  && (!props.validation.date_end || !props.validation.dateRange || !props.validation.startBeforeEnd),
)

const newChoice = ref('')

const isRemovingChoices = computed(() =>
  props.originalChoices.some(choice => !props.modelValue.choices.includes(choice)),
)

function addChoice() {
  const choice = newChoice.value.trim()
  if (choice === '' || props.modelValue.choices.includes(choice))
    return

  update('choices', [...props.modelValue.choices, choice])
  newChoice.value = ''
}

function removeChoice(index: number) {
  update('choices', props.modelValue.choices.filter((_, i) => i !== index))
}
</script>

<template>
  <Flex column gap="m" expand>
    <Input
      :model-value="modelValue.title"
      expand
      label="Title"
      name="title"
      placeholder="What are you voting on?"
      required
      :valid="modelValue.title.trim() !== '' ? validation.title : undefined"
      error="Title is required"
      @update:model-value="update('title', String($event))"
    />

    <Textarea
      :model-value="modelValue.description"
      expand
      label="Description"
      name="description"
      placeholder="Add more context (optional)"
      :rows="3"
      @update:model-value="update('description', $event)"
    />

    <Grid :columns="isMobile ? 1 : 2" expand gap="m">
      <Flex column expand :gap="0">
        <label class="vui-label required">
          Start Date
        </label>
        <Calendar
          :model-value="modelValue.date_start"
          expand
          enable-time-picker
          time-picker-inline
          enable-minutes
          is24
          format="yyyy-MM-dd HH:mm"
          @update:model-value="onDateUpdate('date_start', $event)"
        >
          <template #trigger>
            <Button expand outline :class="{ error: !validation.date_start }">
              {{ modelValue.date_start ? displayDateTime(modelValue.date_start) : 'Choose start date' }}
              <template #start>
                <Icon name="ph:calendar" :size="18" />
              </template>
            </Button>
          </template>
        </Calendar>
      </Flex>

      <Flex column expand :gap="0">
        <label class="vui-label required">
          End Date
        </label>
        <Calendar
          :model-value="modelValue.date_end"
          expand
          enable-time-picker
          time-picker-inline
          enable-minutes
          is24
          format="yyyy-MM-dd HH:mm"
          @click="endTouched = true"
          @update:model-value="onDateUpdate('date_end', $event)"
        >
          <template #trigger>
            <Button expand outline :class="{ error: endDateInvalid }">
              {{ modelValue.date_end ? displayDateTime(modelValue.date_end) : 'Choose end date' }}
              <template #start>
                <Icon name="ph:calendar" :size="18" />
              </template>
            </Button>
          </template>
        </Calendar>
        <span v-if="modelValue.date_end != null && !validation.startBeforeEnd" class="form-error">
          End date must be after start date
        </span>
        <span v-else-if="modelValue.date_end != null && !validation.dateRange" class="form-error">
          End date must be in the future
        </span>
      </Flex>
    </Grid>

    <Checkbox
      :model-value="modelValue.multiple_choice"
      name="multiple_choice"
      label="Allow multiple choice"
      @update:model-value="update('multiple_choice', !!$event)"
    />

    <Flex v-if="canMakePublic" gap="xs" y-center>
      <Checkbox
        :model-value="modelValue.is_public"
        name="is_public"
        label="Show on public votes page"
        @update:model-value="update('is_public', !!$event)"
      />
      <Tooltip>
        <Icon name="ph:info" class="text-color-lighter" />
        <template #tooltip>
          <p>Public votes appear in the votes listing for all users. Private ones are only reachable by link.</p>
        </template>
      </Tooltip>
    </Flex>

    <Flex column :gap="0" expand class="mt-s">
      <label class="vui-label required">
        Voting choices
      </label>
      <p class="vui-hint">
        (minimum 2)
      </p>

      <Flex v-if="isRemovingChoices" gap="xs" y-center class="choices-warning">
        <Icon name="ph:warning" class="choices-warning__icon" />
        <p class="choices-warning__text">
          Removing choices will delete all existing votes cast on this item. Adding choices is safe.
        </p>
      </Flex>

      <Flex gap="xs" y-center expand class="mb-xs">
        <Input
          v-model="newChoice"
          expand
          name="new-choice"
          placeholder="Add a choice and press Enter"
          @keydown.enter.prevent="addChoice"
        />
        <Button
          variant="fill"
          square
          :disabled="!newChoice.trim()"
          @click="addChoice"
        >
          <Icon name="ph:plus" />
        </Button>
      </Flex>

      <Flex v-if="modelValue.choices.length > 0" gap="xs" wrap class="mt-xs">
        <Badge
          v-for="(choice, index) in modelValue.choices"
          :key="choice"
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

      <span v-if="modelValue.choices.length > 0 && !validation.choices" class="form-error mt-xs">
        At least 2 choices are required
      </span>
    </Flex>
  </Flex>
</template>

<style scoped lang="scss">
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

.error {
  border-color: var(--color-text-red) !important;
}
</style>
