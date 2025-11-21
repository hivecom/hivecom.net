<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import { ref } from 'vue'
import ExpenseTable from '@/components/Admin/Funding/ExpenseTable.vue'
import FundingKPIs from '@/components/Admin/Funding/FundingKPIs.vue'
import FundingTable from '@/components/Admin/Funding/FundingTable.vue'

// State for refresh coordination between components
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

    <!-- Funding KPIs -->
    <FundingKPIs v-model:refresh-signal="refreshSignal" />

    <!-- Expense Table -->
    <h2>Expenses</h2>
    <ExpenseTable v-model:refresh-signal="refreshSignal" />

    <!-- Funding Table -->
    <h2>Funding History</h2>
    <FundingTable v-model:refresh-signal="refreshSignal" />
  </Flex>
</template>
