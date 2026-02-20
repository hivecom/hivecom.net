<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import { ref } from 'vue'
import DiscussionKPIs from '@/components/Admin/Discussions/DiscussionKPIs.vue'
import DiscussionTable from '@/components/Admin/Discussions/DiscussionTable.vue'

const { hasPermission } = useAdminPermissions()

const canViewDiscussions = computed(() =>
  hasPermission('discussions.read') || hasPermission('discussions.manage'),
)

if (!canViewDiscussions.value) {
  throw createError({
    statusCode: 403,
    statusMessage: 'Insufficient permissions to view discussions',
  })
}

const refreshSignal = ref(0)
</script>

<template>
  <Flex column gap="l" expand>
    <Flex column :gap="0">
      <h1>Discussions</h1>
      <p class="text-color-light">
        Review and moderate every discussion across the platform.
      </p>
    </Flex>

    <DiscussionKPIs v-model:refresh-signal="refreshSignal" />

    <DiscussionTable v-model:refresh-signal="refreshSignal" />
  </Flex>
</template>
