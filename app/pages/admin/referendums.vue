<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import { ref } from 'vue'
import ReferendumTable from '@/components/Admin/Referendums/ReferendumTable.vue'

definePageMeta({ layout: 'admin' })

// Refresh signal for referendum table
const refreshSignal = ref(0)

// Handle refresh when actions are performed
function handleRefresh() {
  refreshSignal.value += 1
}
</script>

<template>
  <Flex column gap="l">
    <Flex column :gap="0">
      <h1>Referendums</h1>
      <p class="text-color-light">
        Create and manage referendums
      </p>
    </Flex>

    <ReferendumTable
      v-model:refresh-signal="refreshSignal"
      @refresh="handleRefresh"
    />
  </Flex>
</template>
