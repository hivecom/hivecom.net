<script setup lang="ts">
import { Flex, Grid } from '@dolanske/vui'
import { ref } from 'vue'
import Alerts from '@/components/Admin/Alerts.vue'
import IncomeChart from '@/components/Admin/Funding/IncomeChart.vue'
import UserChart from '@/components/Admin/Funding/UserChart.vue'
import KPIOverview from '@/components/Admin/KPIOverview.vue'

// State for refresh coordination between components
const refreshSignal = ref(0)
</script>

<template>
  <Flex column gap="xl">
    <Flex column :gap="0">
      <h1>Dashboard</h1>
      <p class="text-color-light">
        Welcome to the admin panel have a look around, any KPI you can think of can be found
      </p>
    </Flex>

    <!-- KPI Overview -->
    <KPIOverview :refresh-signal="refreshSignal" />

    <!-- Charts Section -->
    <Grid :columns="2" expand y-stretch>
      <!-- Income Chart -->
      <IncomeChart :refresh-signal="refreshSignal" />

      <!-- User Chart -->
      <UserChart :refresh-signal="refreshSignal" />
    </Grid>

    <!-- System Callouts -->
    <Alerts :refresh-signal="refreshSignal" />
  </Flex>
</template>
