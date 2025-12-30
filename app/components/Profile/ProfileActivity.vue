<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import ActivitySteam from './Activity/ActivitySteam.vue'
import ActivityTeamspeak from './Activity/ActivityTeamspeak.vue'

// TODO: Clicking activity item could redirect somewhere depending on the type

interface Props {
  profile: Tables<'profiles'>
  isOwnProfile?: boolean
}

const props = defineProps<Props>()

// Check if user has Steam linked
const hasSteam = computed(() => !!props.profile.steam_id)

// Check if user has TeamSpeak identities linked
const hasTeamspeak = computed(() => {
  const identities = props.profile.teamspeak_identities
  return Array.isArray(identities) && identities.length > 0
})
</script>

<template>
  <div class="activity">
    <!-- <ActivitySpotify /> -->
    <ActivitySteam
      :profile-id="props.profile.id"
      :has-steam="hasSteam"
      :steam-id="props.profile.steam_id"
      :is-own-profile="props.isOwnProfile"
    />
    <ActivityTeamspeak
      v-if="hasTeamspeak"
      :profile-id="props.profile.id"
      :teamspeak-identities="props.profile.teamspeak_identities"
      :is-own-profile="props.isOwnProfile"
    />
  </div>
</template>

<style lang="scss">
.activity {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);
  background-color: var(--color-bg-card);
  overflow: hidden;

  .activity-item {
    &:not(:last-child) {
      border-bottom: 1px solid var(--color-border);
    }
  }
}
</style>
