<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import DepotFileTable from '@/components/Admin/Depot/DepotFileTable.vue'
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

    <DepotFileTable />
  </Flex>
</template>
