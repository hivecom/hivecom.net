<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Button, Dropdown, DropdownItem, DropdownTitle } from '@dolanske/vui'
import { useEventTiming } from '@/composables/useEventTiming'
import { useRSVP } from '@/composables/useRSVP'

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
const { rsvpStatus, rsvpLoading, updateRsvp, removeRsvp } = useRSVP(() => props.event)

// Computed properties
const canRsvp = computed(() => {
  return user.value && props.event
})

const rsvpButtonText = computed(() => {
  if (!rsvpStatus.value && hasEventEnded.value)
    return 'RSVP closed'

  switch (rsvpStatus.value) {
    case 'yes':
      return 'Going'
    case 'no':
      return 'Not Going'
    case 'tentative':
      return 'Maybe'
    default:
      return 'RSVP'
  }
})

const rsvpButtonVariant = computed(() => {
  switch (rsvpStatus.value) {
    case 'yes':
      return 'accent'
    case 'no':
      return 'danger'
    case 'tentative':
      return 'gray'
    default:
      return 'accent'
  }
})

const rsvpButtonIcon = computed(() => {
  switch (rsvpStatus.value) {
    case 'yes':
      return 'ph:check-circle-fill'
    case 'no':
      return 'ph:x-circle-fill'
    case 'tentative':
      return 'ph:question'
    default:
      return 'ph:calendar-check'
  }
})

const rsvpDisabled = computed(() => {
  if (rsvpLoading.value)
    return true

  if (!user.value || !props.event)
    return true

  return hasEventEnded.value
})

// Simple toggle for non-dropdown variant
function toggleRsvp() {
  if (hasEventEnded.value)
    return

  if (!rsvpStatus.value) {
    void updateRsvp('yes')
  }
  else if (rsvpStatus.value === 'yes') {
    void updateRsvp('no')
  }
  else {
    void updateRsvp('yes')
  }
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
      <!-- RSVP Status with dropdown (always show dropdown) -->
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

        <DropdownTitle>
          RSVP Options
        </DropdownTitle>

        <DropdownItem
          icon="ph:check-circle"
          :disabled="rsvpDisabled"
          @click="updateRsvp('yes')"
        >
          Going
          <template v-if="rsvpStatus === 'yes'" #end>
            <Icon name="ph:check" size="16" />
          </template>
        </DropdownItem>

        <DropdownItem
          icon="ph:question"
          :disabled="rsvpDisabled"
          @click="updateRsvp('tentative')"
        >
          Maybe
          <template v-if="rsvpStatus === 'tentative'" #end>
            <Icon name="ph:check" size="16" />
          </template>
        </DropdownItem>

        <DropdownItem
          icon="ph:x-circle"
          :disabled="rsvpDisabled"
          @click="updateRsvp('no')"
        >
          Not Going
          <template v-if="rsvpStatus === 'no'" #end>
            <Icon name="ph:check" size="16" />
          </template>
        </DropdownItem>

        <DropdownTitle v-if="rsvpStatus">
          Actions
        </DropdownTitle>

        <DropdownItem
          v-if="rsvpStatus"
          icon="ph:trash"
          :disabled="rsvpDisabled"
          @click="removeRsvp()"
        >
          Remove RSVP
        </DropdownItem>
      </Dropdown>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.rsvp-button-container {
  display: inline-block;
}
</style>
