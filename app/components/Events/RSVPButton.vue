<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { Button, Dropdown, DropdownItem, DropdownTitle, Flex, Modal } from '@dolanske/vui'
import { useEventTiming } from '@/composables/useEventTiming'
import { useRSVP } from '@/composables/useRSVP'
import { isSeriesActive } from '@/lib/utils/rrule'

type RSVPStatus = Database['public']['Enums']['events_rsvp_status']

interface Props {
  event: Tables<'events'>
  size?: 's' | 'm' | 'l'
  variant?: 'full' | 'simple' // full = dropdown, simple = toggle only
}

const props = withDefaults(defineProps<Props>(), {
  size: 's',
  variant: 'full',
})

const user = useSupabaseUser()

const { hasEventEnded } = useEventTiming(() => props.event)
const {
  rsvpStatus,
  rsvpLoading,
  updateRsvp,
  removeRsvp,
} = useRSVP(
  () => props.event,
  () => isSeriesActive(props.event) ? props.event.date : null,
)

// Recurring series parent with future occurrences: UNTIL not yet passed.
// These are never "ended" - new occurrences keep coming.
const isRecurringSeries = computed(() => isSeriesActive(props.event))

// When the user picks a status from the dropdown on a recurring occurrence,
// show a scope-choice modal before committing.
const pendingStatus = ref<RSVPStatus | null>(null)
const showScopeModal = ref(false)

const canRsvp = computed(() => user.value && props.event)

const rsvpButtonText = computed(() => {
  if (!rsvpStatus.value && hasEventEnded.value && !isRecurringSeries.value)
    return 'RSVP closed'

  switch (rsvpStatus.value) {
    case 'yes': return 'Going'
    case 'no': return 'Not Going'
    case 'tentative': return 'Maybe'
    default: return 'RSVP'
  }
})

const rsvpButtonVariant = computed(() => {
  switch (rsvpStatus.value) {
    case 'yes': return 'accent'
    case 'no': return 'danger'
    case 'tentative': return 'gray'
    default: return 'accent'
  }
})

const rsvpButtonIcon = computed(() => {
  switch (rsvpStatus.value) {
    case 'yes': return 'ph:check-circle-fill'
    case 'no': return 'ph:x-circle-fill'
    case 'tentative': return 'ph:question'
    default: return 'ph:calendar-check'
  }
})

const rsvpDisabled = computed(() => {
  if (rsvpLoading.value)
    return true
  if (!user.value || !props.event)
    return true
  // Recurring series never closes - new occurrences always upcoming
  if (isRecurringSeries.value)
    return false
  return hasEventEnded.value
})

// For recurring series parents or child occurrences, intercept status picks
// and ask whether the user wants to apply just this occurrence or the whole series.
function handleStatusPick(status: RSVPStatus) {
  if (hasEventEnded.value && !isRecurringSeries.value)
    return

  if (isRecurringSeries.value) {
    pendingStatus.value = status
    showScopeModal.value = true
  }
  else {
    void updateRsvp(status, 'occurrence')
  }
}

function confirmScope(scope: 'occurrence' | 'series') {
  if (pendingStatus.value == null)
    return
  void updateRsvp(pendingStatus.value, scope)
  showScopeModal.value = false
  pendingStatus.value = null
}

function cancelScopeModal() {
  showScopeModal.value = false
  pendingStatus.value = null
}

// Simple toggle for non-dropdown variant
function toggleRsvp() {
  if (hasEventEnded.value && !isRecurringSeries.value)
    return

  const next: RSVPStatus = rsvpStatus.value === 'yes' ? 'no' : 'yes'
  handleStatusPick(next)
}
</script>

<template>
  <div v-if="canRsvp" class="rsvp-button-container">
    <!-- Simple variant: just a toggle button -->
    <Button
      v-if="variant === 'simple'"
      :variant="rsvpButtonVariant"
      :loading="rsvpLoading"
      :disabled="rsvpDisabled"
      :size="size"
      @click="toggleRsvp"
    >
      <template #start>
        <Icon :name="rsvpButtonIcon" />
      </template>
      {{ rsvpButtonText }}
    </Button>

    <!-- Full variant: dropdown with all options -->
    <template v-else>
      <Dropdown>
        <template #trigger="{ toggle }">
          <Button
            :variant="rsvpButtonVariant"
            :disabled="rsvpDisabled"
            :size="size"
            @click="() => !rsvpDisabled && toggle()"
          >
            <template #start>
              <Icon :name="rsvpButtonIcon" />
            </template>
            {{ rsvpButtonText }}
            <template #end>
              <Icon name="ph:caret-down" size="12" />
            </template>
          </Button>
        </template>

        <DropdownTitle>RSVP Options</DropdownTitle>

        <DropdownItem
          icon="ph:check-circle"
          :disabled="rsvpDisabled"
          @click="handleStatusPick('yes')"
        >
          Going
          <template v-if="rsvpStatus === 'yes'" #end>
            <Icon name="ph:check" size="16" />
          </template>
        </DropdownItem>

        <DropdownItem
          icon="ph:question"
          :disabled="rsvpDisabled"
          @click="handleStatusPick('tentative')"
        >
          Maybe
          <template v-if="rsvpStatus === 'tentative'" #end>
            <Icon name="ph:check" size="16" />
          </template>
        </DropdownItem>

        <DropdownItem
          icon="ph:x-circle"
          :disabled="rsvpDisabled"
          @click="handleStatusPick('no')"
        >
          Not Going
          <template v-if="rsvpStatus === 'no'" #end>
            <Icon name="ph:check" size="16" />
          </template>
        </DropdownItem>

        <template v-if="rsvpStatus">
          <DropdownTitle>Actions</DropdownTitle>
          <DropdownItem
            icon="ph:trash"
            :disabled="rsvpDisabled"
            @click="removeRsvp()"
          >
            Remove RSVP
          </DropdownItem>
        </template>
      </Dropdown>
    </template>
  </div>

  <!-- Scope choice modal - shown when RSVPing on a child occurrence -->
  <Modal
    :open="showScopeModal"
    centered
    size="s"
    :card="{ footerSeparator: true }"
    @close="cancelScopeModal"
  >
    <template #header>
      <h4>Apply RSVP</h4>
    </template>

    <p class="text-color-light">
      This is a recurring event. Apply your RSVP to the whole series, or just a single occurrence?
    </p>

    <template #footer>
      <Flex gap="xs" x-end expand>
        <Button variant="gray" @click="cancelScopeModal">
          Cancel
        </Button>
        <Button variant="gray" @click="confirmScope('occurrence')">
          <template #start>
            <Icon name="ph:calendar-check" />
          </template>
          Just this one
        </Button>
        <Button variant="accent" @click="confirmScope('series')">
          <template #start>
            <Icon name="ph:arrows-clockwise" />
          </template>
          Whole series
        </Button>
      </Flex>
    </template>
  </Modal>
</template>

<style lang="scss" scoped>
.rsvp-button-container {
  display: inline-block;
}
</style>
