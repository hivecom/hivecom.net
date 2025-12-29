<script setup lang="ts">
import ActivityGame from './Activity/ActivityGame.vue'
import ActivitySpotify from './Activity/ActivitySpotify.vue'
import ActivityTeamspeak from './Activity/ActivityTeamspeak.vue'

// TODO: move teamspeak rich presence from next to the name (in profile) to this component
// TODO: Clicking activity item could redirect somewhere depending on the type
</script>

<template>
  <div class="activity">
    <ActivitySpotify />
    <ActivityGame />
    <ActivityTeamspeak />
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
