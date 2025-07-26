<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import { computed, ref } from 'vue'

import EventKPIs from '@/components/Admin/Events/EventKPIs.vue'
import EventTable from '@/components/Admin/Events/EventTable.vue'

// Get admin permissions
const { hasPermission } = useAdminPermissions()

// Permission checks
const canViewEvents = computed(() => hasPermission('events.read'))
const canManageEvents = computed(() => hasPermission('events.create') || hasPermission('events.update') || hasPermission('events.delete'))

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

    <!-- Show content only if user can view events -->
    <template v-if="canViewEvents">
      <!-- Event KPIs -->
      <EventKPIs :refresh-signal="refreshSignal" />

      <!-- Events Table -->
      <EventTable
        v-model:refresh-signal="refreshSignal"
        :can-manage="canManageEvents"
      />
    </template>

    <!-- No permission message -->
    <div v-else class="no-permission">
      <p>You don't have permission to view events.</p>
    </div>
  </Flex>
</template>
