<script setup lang="ts">
import { computed } from 'vue'
import ProfileBadge from '@/components/Profile/Badges/ProfileBadge.vue'
import { getPartyAnimalVariant, PARTY_ANIMAL_MIN_RSVPS } from '@/lib/partyAnimalBadge'

const props = defineProps<{
  rsvps: number
  compact?: boolean
}>()

const rsvpCount = computed(() => Math.max(0, Math.floor(props.rsvps ?? 0)))
const variant = computed(() => getPartyAnimalVariant(rsvpCount.value))
const description = computed(() => `RSVP'd "Yes" to ${rsvpCount.value} event${rsvpCount.value === 1 ? '' : 's'}.`)
const shouldRender = computed(() => (variant.value !== undefined) && rsvpCount.value >= PARTY_ANIMAL_MIN_RSVPS)
</script>

<template>
  <ProfileBadge
    v-if="shouldRender && variant"
    label="Party Animal"
    :description="description"
    icon="ph:confetti-bold"
    :variant="variant"
    :compact="props.compact"
  />
</template>
