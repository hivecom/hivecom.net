<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import { ref } from 'vue'
import ExpenseTable from '@/components/Admin/Funding/ExpenseTable.vue'
import FundingKPIs from '@/components/Admin/Funding/FundingKPIs.vue'
import FundingTable from '@/components/Admin/Funding/FundingTable.vue'

definePageMeta({ layout: 'admin' })

const refreshSignal = ref(0)
</script>

<template>
  <Flex column gap="l" expand>
    <Flex column :gap="0">
      <h1>Funding</h1>
      <p class="text-color-light">
        Manage expenses and view our funding history
      </p>
    </Flex>

    <FundingKPIs v-model:refresh-signal="refreshSignal" />

    <h2>Expenses</h2>
    <ExpenseTable v-model:refresh-signal="refreshSignal" />

    <h2>Funding History</h2>
    <FundingTable v-model:refresh-signal="refreshSignal" />
  </Flex>
</template>
