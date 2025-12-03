<script setup lang="ts">
import { computed } from 'vue'
import { getLifeOfThePartyVariant, LIFE_OF_PARTY_MIN_RSVPS } from '@/components/Profile/Badges/partyAnimalBadge'
import ProfileBadge from '@/components/Profile/Badges/ProfileBadge.vue'

const props = defineProps<{
  rsvps: number
  compact?: boolean
}>()

const rsvpCount = computed(() => Math.max(0, Math.floor(props.rsvps ?? 0)))
const variant = computed(() => getLifeOfThePartyVariant(rsvpCount.value))
const description = computed(() => `RSVP'd "Yes" to ${rsvpCount.value} event${rsvpCount.value === 1 ? '' : 's'}.`)
const shouldRender = computed(() => (variant.value !== undefined) && rsvpCount.value >= LIFE_OF_PARTY_MIN_RSVPS)
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
