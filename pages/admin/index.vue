<script setup lang="ts">
import { Flex, Grid } from '@dolanske/vui'
import { ref } from 'vue'
import IncomeChart from '~/components/Admin/Funding/IncomeChart.vue'
import PatreonChart from '~/components/Admin/Funding/PatreonChart.vue'

// State for refresh coordination between components
const refreshSignal = ref(0)
</script>

<template>
  <Flex column gap="l">
    <Flex column :gap="0">
      <h1>Dashboard</h1>
      <p class="color-text-light">
        Welcome to the admin panel have a look around, any KPI you can think of can be found
      </p>
    </Flex>

    <Grid :columns="2" expand y-stretch>
      <!-- Income Chart -->
      <IncomeChart :refresh-signal="refreshSignal" />

      <!-- Patreon Chart -->
      <PatreonChart :refresh-signal="refreshSignal" />
    </Grid>
  </Flex>
</template>
