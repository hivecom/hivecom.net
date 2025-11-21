<script setup lang="ts">
import { Flex, Grid } from '@dolanske/vui'
import { computed, ref } from 'vue'
import Alerts from '@/components/Admin/Alerts.vue'
import IncomeChart from '@/components/Admin/Funding/IncomeChart.vue'
import UserChart from '@/components/Admin/Funding/UserChart.vue'
import KPIOverview from '@/components/Admin/KPIOverview.vue'
import { useBreakpoint } from '@/lib/utils/mediaQuery'

// State for refresh coordination between components
const refreshSignal = ref(0)

// Keep JS breakpoints aligned with app/assets/breakpoints.scss
const isBelowSm = useBreakpoint('<md')
const chartColumns = computed(() => (isBelowSm.value ? 1 : 2))
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
    <Grid :columns="chartColumns" expand y-stretch>
      <!-- Income Chart -->
      <IncomeChart :refresh-signal="refreshSignal" />

      <!-- User Chart -->
      <UserChart :refresh-signal="refreshSignal" />
    </Grid>

    <!-- System Callouts -->
    <Alerts :refresh-signal="refreshSignal" />
  </Flex>
</template>
