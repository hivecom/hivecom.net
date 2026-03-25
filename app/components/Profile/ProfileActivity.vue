<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Flex } from '@dolanske/vui'
import ActivitySteam from './Activity/ActivitySteam.vue'
import ActivityTeamspeak from './Activity/ActivityTeamspeak.vue'

// TODO: Clicking activity item could redirect somewhere depending on the type

interface Props {
  profile: Tables<'profiles'>
  isOwnProfile?: boolean
  isLoggedIn?: boolean
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
    <!-- Unauthenticated State -->
    <Flex v-if="!isLoggedIn" column y-center x-center gap="s" class="activity-locked">
      <Icon name="ph:lock" size="32" class="text-color-light" />
      <p class="text-color-light text-s text-center">
        Sign in to see {{ profile.username }}'s activity.
      </p>
    </Flex>

    <template v-else>
      <!-- <ActivitySpotify /> -->
      <ActivitySteam
        v-if="hasSteam"
        :profile-id="props.profile.id"
        :steam-id="props.profile.steam_id"
        :is-own-profile="props.isOwnProfile"
      />
      <ActivityTeamspeak
        v-if="hasTeamspeak"
        :profile-id="props.profile.id"
        :teamspeak-identities="props.profile.teamspeak_identities"
        :is-own-profile="props.isOwnProfile"
        :rich-presence-enabled="props.profile.rich_presence_enabled"
      />
    </template>
  </div>
</template>

<style lang="scss">
.activity {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);
  background-color: var(--color-bg-card);
  overflow: hidden;

  .activity-locked {
    padding: var(--space-l) var(--space-m);
  }

  .activity-item {
    &:not(:last-child) {
      border-bottom: 1px solid var(--color-border);
    }
  }
}
</style>
