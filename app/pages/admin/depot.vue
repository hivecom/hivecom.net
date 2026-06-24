<script setup lang="ts">
import { Flex, Tab, Tabs } from '@dolanske/vui'
import { ref } from 'vue'
import DepotFileTable from '@/components/Admin/Depot/DepotFileTable.vue'
import DepotKPIs from '@/components/Admin/Depot/DepotKPIs.vue'
import DepotUserTable from '@/components/Admin/Depot/DepotUserTable.vue'
import { useAdminPermissions } from '@/composables/useAdminPermissions'
import { useDepot } from '@/composables/useDepot'

definePageMeta({ layout: 'admin' })

const { canViewDepot } = useAdminPermissions()

if (!canViewDepot.value) {
  throw createError({
    statusCode: 403,
    statusMessage: 'Insufficient permissions to view depot uploads',
  })
}

const { host } = useDepot()

// Shared so a delete in the table refetches the KPI cards.
const refreshSignal = ref(0)

const activeTab = ref<'files' | 'users'>('files')
</script>

<template>
  <Flex column gap="l" expand>
    <Flex column :gap="0" expand>
      <h1>Depot</h1>
      <p class="text-color-light">
        Moderate uploads stored on the Orbit Depot gateway ({{ host }}). Listing and deletion are
        service-operator capabilities, so only admins reach this page.
      </p>
    </Flex>

    <DepotKPIs v-model:refresh-signal="refreshSignal" />

    <Tabs v-model="activeTab">
      <Tab value="files">
        Files
      </Tab>
      <Tab value="users">
        Users
      </Tab>
    </Tabs>

    <DepotFileTable v-if="activeTab === 'files'" v-model:refresh-signal="refreshSignal" />
    <DepotUserTable v-else v-model:refresh-signal="refreshSignal" />
  </Flex>
</template>
