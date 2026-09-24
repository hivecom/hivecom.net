<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import { ref } from 'vue'
import ComplaintKPIs from '@/components/Admin/Complaints/ComplaintKPIs.vue'
import ComplaintList from '@/components/Admin/Complaints/ComplaintList.vue'

definePageMeta({ layout: 'admin' })

const refreshSignal = ref(0)

function handleRefreshSignal(value: number) {
  refreshSignal.value = value
}
</script>

<template>
  <Flex column gap="l">
    <Flex column :gap="0">
      <h1>Complaints</h1>
      <p class="text-color-light">
        Acknowledge, review and respond to community user complaints
      </p>
    </Flex>

    <ComplaintKPIs v-model:refresh-signal="refreshSignal" />

    <ComplaintList
      v-model:refresh-signal="refreshSignal"
      @update:refresh-signal="handleRefreshSignal"
    />
  </Flex>
</template>
