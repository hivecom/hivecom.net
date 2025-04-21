<script setup lang="ts">
import { Tab, Tabs } from '@dolanske/vui'

const activeTab = ref('Servers')
const availableTabs = ['Servers', 'Gameservers', 'Gameserver Containers']
</script>

<template>
  <div>
    <h3>Network</h3>
    <Tabs v-model="activeTab">
      <Tab v-for="item in availableTabs" :key="item" :label="item" />
    </Tabs>
  </div>
</template>
