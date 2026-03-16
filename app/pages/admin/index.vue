<script setup lang="ts">
import { Flex, Grid } from '@dolanske/vui'
import { computed } from 'vue'
import Alerts from '@/components/Admin/Alerts.vue'
import IncomeChart from '@/components/Admin/Funding/IncomeChart.vue'
import UserChart from '@/components/Admin/Funding/UserChart.vue'
import KPIOverview from '@/components/Admin/KPIOverview.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

// Keep JS breakpoints aligned with app/assets/breakpoints.scss
const isBelowM = useBreakpoint('<m')
const chartColumns = computed(() => (isBelowM.value ? 1 : 2))
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
    <KPIOverview />

    <!-- Charts Section -->
    <Grid :columns="chartColumns" expand y-stretch>
      <!-- Income Chart -->
      <IncomeChart />

      <!-- User Chart -->
      <UserChart />
    </Grid>

    <!-- System Callouts -->
    <Alerts />
  </Flex>
</template>
