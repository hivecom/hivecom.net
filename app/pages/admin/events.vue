<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import { computed, ref } from 'vue'

import EventKPIs from '@/components/Admin/Events/EventKPIs.vue'
import EventTable from '@/components/Admin/Events/EventTable.vue'
import { useAdminPermissions } from '@/composables/useAdminPermissions'

definePageMeta({ layout: 'admin' })

const { hasPermission } = useAdminPermissions()

const canViewEvents = computed(() => hasPermission('events.read'))

const refreshSignal = ref(0)
</script>

<template>
  <Flex column gap="l">
    <Flex column :gap="0">
      <h1>Events</h1>
      <p class="text-color-light">
        Manage and schedule events for the community
      </p>
    </Flex>

    <template v-if="canViewEvents">
      <EventKPIs />

      <EventTable v-model:refresh-signal="refreshSignal" />
    </template>

    <div v-else class="no-permission">
      <p>You don't have permission to view events.</p>
    </div>
  </Flex>
</template>
