<script setup lang="ts">
import type { Database, Tables } from '@/types/database.types'
import { Button, Dropdown, DropdownItem, DropdownTitle } from '@dolanske/vui'

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

// RSVP functionality
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const userId = useUserId()
const rsvpStatus = ref<RSVPStatus | null>(null)
const rsvpLoading = ref(false)
const rsvpId = ref<number | null>(null)
const now = ref(new Date())

const eventStart = computed(() => props.event ? new Date(props.event.date) : null)
const eventEnd = computed(() => {
  if (!eventStart.value)
    return null

  if (props.event.duration_minutes) {
    return new Date(eventStart.value.getTime() + props.event.duration_minutes * 60 * 1000)
  }

  return eventStart.value
})

const hasEventEnded = computed(() => {
  if (!eventEnd.value)
    return false

  return now.value >= eventEnd.value
})

useIntervalFn(() => {
  now.value = new Date()
}, 60_000, { immediate: true })

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

// Functions
async function checkRsvpStatus() {
  if (!user.value || !userId.value || !props.event) {
    rsvpStatus.value = null
    return
  }

  try {
    const { data, error } = await supabase
      .from('events_rsvps')
      .select('id, rsvp')
      .eq('user_id', userId.value)
      .eq('event_id', props.event.id)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
      console.error('Error checking RSVP status:', error)
      return
    }

    if (data) {
      rsvpStatus.value = data.rsvp
      rsvpId.value = data.id
    }
    else {
      rsvpStatus.value = null
      rsvpId.value = null
    }
  }
  catch (error) {
    console.error('Error checking RSVP status:', error)
  }
}

async function updateRsvp(newStatus: RSVPStatus) {
  if (!user.value || !userId.value || !props.event) {
    return
  }

  if (hasEventEnded.value) {
    console.warn('RSVP updates are disabled because the event has ended.')
    return
  }

  rsvpLoading.value = true

  try {
    if (rsvpId.value) {
      // Update existing RSVP
      const { data, error } = await supabase
        .from('events_rsvps')
        .update({
          rsvp: newStatus,
          modified_by: userId.value,
        })
        .eq('id', rsvpId.value)
        .select('id, rsvp')
        .single()

      if (error)
        throw error

      rsvpStatus.value = data.rsvp
    }
    else {
      // Create new RSVP
      const { data, error } = await supabase
        .from('events_rsvps')
        .insert({
          user_id: userId.value,
          event_id: props.event.id,
          rsvp: newStatus,
          created_by: userId.value,
        })
        .select('id, rsvp')
        .single()

      if (error)
        throw error

      rsvpStatus.value = data.rsvp
      rsvpId.value = data.id
    }

    // Emit event to notify other components
    window.dispatchEvent(new CustomEvent('rsvp-updated', {
      detail: { eventId: props.event.id, newStatus },
    }))
  }
  catch (error) {
    console.error('Error updating RSVP:', error)
  }
  finally {
    rsvpLoading.value = false
  }
}

async function removeRsvp() {
  if (!rsvpId.value) {
    return
  }

  if (hasEventEnded.value) {
    console.warn('RSVP removals are disabled because the event has ended.')
    return
  }

  rsvpLoading.value = true

  try {
    const { error } = await supabase
      .from('events_rsvps')
      .delete()
      .eq('id', rsvpId.value)

    if (error)
      throw error

    rsvpStatus.value = null
    rsvpId.value = null

    // Emit event to notify other components
    window.dispatchEvent(new CustomEvent('rsvp-updated', {
      detail: { eventId: props.event.id, newStatus: null },
    }))
  }
  catch (error) {
    console.error('Error removing RSVP:', error)
  }
  finally {
    rsvpLoading.value = false
  }
}

// Simple toggle for non-dropdown variant
function toggleRsvp() {
  if (hasEventEnded.value) {
    console.warn('RSVP updates are disabled because the event has ended.')
    return
  }

  if (!rsvpStatus.value) {
    updateRsvp('yes')
  }
  else if (rsvpStatus.value === 'yes') {
    updateRsvp('no')
  }
  else {
    updateRsvp('yes')
  }
}

// Lifecycle
onMounted(() => {
  checkRsvpStatus()
})

// Watch for user changes
watch(() => user.value?.id, () => {
  checkRsvpStatus()
})

// Watch for event changes
watch(() => props.event?.id, () => {
  checkRsvpStatus()
})
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
