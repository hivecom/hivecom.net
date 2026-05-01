<script setup lang="ts">
import { Button, Calendar, Flex, Input, Select } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  modelValue: string | null
  // The currently selected event date - used to derive smart defaults
  // for BYMONTHDAY (monthly) and BYDAY (weekly) when no rule exists yet.
  eventDate?: Date | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

// ── Types ─────────────────────────────────────────────────────────────────────

type Freq = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'

interface FreqOption { label: string, value: Freq }

const FREQ_OPTIONS: FreqOption[] = [
  { label: 'Does not repeat', value: 'NONE' },
  { label: 'Daily', value: 'DAILY' },
  { label: 'Weekly', value: 'WEEKLY' },
  { label: 'Monthly', value: 'MONTHLY' },
  { label: 'Yearly', value: 'YEARLY' },
]

const DAYS = [
  { label: 'M', full: 'Monday', value: 'MO' },
  { label: 'T', full: 'Tuesday', value: 'TU' },
  { label: 'W', full: 'Wednesday', value: 'WE' },
  { label: 'T', full: 'Thursday', value: 'TH' },
  { label: 'F', full: 'Friday', value: 'FR' },
  { label: 'S', full: 'Saturday', value: 'SA' },
  { label: 'S', full: 'Sunday', value: 'SU' },
] as const

type DayCode = typeof DAYS[number]['value']

// ── Internal state ─────────────────────────────────────────────────────────────

const freq = ref<Freq>('NONE')
const interval = ref<number>(1)
const selectedDays = ref<DayCode[]>([])
const monthDay = ref<number>(1)
const untilDate = ref<Date | null>(null)

// ── Day-of-week code map ──────────────────────────────────────────────────────

const WEEKDAY_TO_CODE: DayCode[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

function dayCodeFromDate(d: Date): DayCode {
  return WEEKDAY_TO_CODE[d.getDay()]!
}

// ── Parse incoming RRULE into internal state ──────────────────────────────────

function parseUntil(until: string): Date | null {
  // Format: YYYYMMDDTHHmmssZ
  const match = until.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/)
  if (!match)
    return null
  return new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`)
}

function parseRule(rule: string | null) {
  if (!rule) {
    freq.value = 'NONE'
    interval.value = 1
    selectedDays.value = []
    monthDay.value = 1
    untilDate.value = null
    return
  }

  const parts = Object.fromEntries(
    rule.split(';').map(part => part.split('=')),
  ) as Record<string, string>

  freq.value = (parts.FREQ as Freq) ?? 'NONE'
  interval.value = parts.INTERVAL ? Number.parseInt(parts.INTERVAL, 10) : 1

  const dateRef = props.eventDate ?? null

  selectedDays.value = parts.BYDAY
    ? (parts.BYDAY.split(',') as DayCode[])
    : (dateRef && freq.value === 'WEEKLY' ? [dayCodeFromDate(dateRef)] : [])

  monthDay.value = parts.BYMONTHDAY
    ? Number.parseInt(parts.BYMONTHDAY, 10)
    : (dateRef && freq.value === 'MONTHLY' ? dateRef.getDate() : 1)

  untilDate.value = parts.UNTIL ? parseUntil(parts.UNTIL) : null
}

// ── Build RRULE from internal state ───────────────────────────────────────────

function formatUntil(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
}

function buildRule(): string | null {
  if (freq.value === 'NONE')
    return null

  const parts: string[] = [`FREQ=${freq.value}`]

  if (interval.value > 1)
    parts.push(`INTERVAL=${interval.value}`)

  if (freq.value === 'WEEKLY' && selectedDays.value.length > 0)
    parts.push(`BYDAY=${selectedDays.value.join(',')}`)

  if (freq.value === 'MONTHLY' && monthDay.value >= 1 && monthDay.value <= 31)
    parts.push(`BYMONTHDAY=${monthDay.value}`)

  if (untilDate.value)
    parts.push(`UNTIL=${formatUntil(untilDate.value)}`)

  return parts.join(';')
}

// ── Sync: prop -> state (on open/change) ──────────────────────────────────────

watch(() => props.modelValue, (val) => {
  parseRule(val)
}, { immediate: true })

// When the user picks a new event date, update BYDAY/BYMONTHDAY if they
// haven't been explicitly customised (i.e. still match the old date's value).
watch(() => props.eventDate, (newDate) => {
  if (!newDate || freq.value === 'NONE')
    return
  if (freq.value === 'WEEKLY') {
    // Only update if the current selection is a single auto-derived day
    if (selectedDays.value.length <= 1)
      selectedDays.value = [dayCodeFromDate(newDate)]
  }
  if (freq.value === 'MONTHLY') {
    monthDay.value = newDate.getDate()
  }
})

// ── Sync: state -> emit ───────────────────────────────────────────────────────

watch([freq, interval, selectedDays, monthDay, untilDate], () => {
  emit('update:modelValue', buildRule())
}, { deep: true })

// ── Freq select model (VUI Select uses arrays) ────────────────────────────────

interface FreqSelectOption { label: string, value: Freq }

const freqModel = computed<FreqSelectOption[]>({
  get(): FreqSelectOption[] {
    const match = FREQ_OPTIONS.find(o => o.value === freq.value)
    return [match ?? FREQ_OPTIONS[0]!]
  },
  set(selection: FreqSelectOption[]) {
    const val = selection?.[0]?.value ?? 'NONE'
    freq.value = val
    interval.value = 1
    untilDate.value = null
    // Derive smart defaults from the event date when switching frequency
    const dateRef = props.eventDate ?? null
    selectedDays.value = val === 'WEEKLY' && dateRef ? [dayCodeFromDate(dateRef)] : []
    monthDay.value = val === 'MONTHLY' && dateRef ? dateRef.getDate() : 1
  },
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function toggleDay(day: DayCode) {
  if (selectedDays.value.includes(day)) {
    selectedDays.value = selectedDays.value.filter(d => d !== day)
  }
  else {
    // Maintain canonical day order
    const order = DAYS.map(d => d.value)
    selectedDays.value = [...selectedDays.value, day].sort(
      (a, b) => order.indexOf(a) - order.indexOf(b),
    )
  }
}

const intervalLabel = computed(() => {
  switch (freq.value) {
    case 'DAILY': return interval.value === 1 ? 'day' : 'days'
    case 'WEEKLY': return interval.value === 1 ? 'week' : 'weeks'
    case 'MONTHLY': return interval.value === 1 ? 'month' : 'months'
    case 'YEARLY': return interval.value === 1 ? 'year' : 'years'
    default: return ''
  }
})

const intervalInputValue = computed({
  get: () => interval.value.toString(),
  set: (v: string) => {
    const n = Number.parseInt(v, 10)
    interval.value = Number.isFinite(n) && n >= 1 ? n : 1
  },
})

const monthDayInputValue = computed({
  get: () => monthDay.value.toString(),
  set: (v: string) => {
    const n = Number.parseInt(v, 10)
    monthDay.value = Number.isFinite(n) && n >= 1 && n <= 31 ? n : 1
  },
})

const untilDateLabel = computed(() => {
  if (!untilDate.value)
    return 'No end date'
  return untilDate.value.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
})
</script>

<template>
  <Flex column gap="s" expand>
    <span class="text-s font-medium">Recurrence</span>

    <!-- Frequency + interval on one row -->
    <Flex gap="xs" y-center wrap>
      <Select
        v-model="freqModel"
        :single="true"
        style="min-width: 160px;"
        :options="FREQ_OPTIONS"
        placeholder="Does not repeat"
      />

      <template v-if="freq !== 'NONE'">
        <span class="text-s text-color-light">every</span>
        <Input
          v-model="intervalInputValue"
          style="width: 72px;"
          type="number"
          :min="1"
          :max="99"
          name="recurrence_interval"
        />
        <span class="text-s text-color-light">{{ intervalLabel }}</span>

        <!-- Weekly: day toggles inline -->
        <template v-if="freq === 'WEEKLY'">
          <button
            v-for="day in DAYS"
            :key="day.value"
            type="button"
            class="day-btn"
            :class="{ 'day-btn--active': selectedDays.includes(day.value) }"
            :title="day.full"
            @click="toggleDay(day.value)"
          >
            {{ day.label }}
          </button>
        </template>

        <!-- Monthly: day of month inline -->
        <template v-if="freq === 'MONTHLY'">
          <span class="text-s text-color-light">on day</span>
          <Input
            v-model="monthDayInputValue"
            style="width: 72px;"
            type="number"
            :min="1"
            :max="31"
            name="recurrence_month_day"
          />
        </template>
      </template>
    </Flex>

    <!-- End date row -->
    <template v-if="freq !== 'NONE'">
      <Flex gap="xs" y-center>
        <span class="text-s text-color-light">until</span>
        <Calendar
          v-model="untilDate"
          format="yyyy-MM-dd"
        >
          <template #trigger>
            <Button
              size="s"
              variant="gray"
              class="until-btn"
            >
              {{ untilDateLabel }}
              <template #end>
                <Icon name="ph:calendar" size="14" />
              </template>
            </Button>
          </template>
        </Calendar>
        <Button
          v-if="untilDate"
          size="s"
          variant="gray"
          plain
          square
          title="Clear end date"
          @click="untilDate = null"
        >
          <Icon name="ph:x" size="14" />
        </Button>
      </Flex>
    </template>
  </Flex>
</template>

<style lang="scss" scoped>
.day-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--color-border);
  background: var(--color-bg-raised);
  color: var(--color-text-light);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background var(--transition),
    color var(--transition),
    border-color var(--transition);

  &:hover {
    border-color: var(--color-border-strong);
    color: var(--color-text);
  }

  &--active {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-text-invert);

    &:hover {
      background: var(--color-accent);
      border-color: var(--color-accent);
      color: var(--color-text-invert);
    }
  }
}

.until-btn {
  min-width: 140px;
}
</style>
