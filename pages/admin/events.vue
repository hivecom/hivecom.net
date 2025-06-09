<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import { ref } from 'vue'

import EventKPIs from '~/components/Admin/Events/EventKPIs.vue'
import EventTable from '~/components/Admin/Events/EventTable.vue'

// State for refresh coordination between components
const refreshSignal = ref(0)
</script>

<template>
  <Flex column gap="l">
    <Flex column :gap="0">
      <h1>Events</h1>
      <p class="color-text-light">
        Manage and schedule events for the community
      </p>
    </Flex>
    <!-- Event KPIs -->
    <EventKPIs :refresh-signal="refreshSignal" />

    <!-- Events Table -->
    <EventTable v-model:refresh-signal="refreshSignal" />
  </Flex>
</template>
