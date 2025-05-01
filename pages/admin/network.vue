<script setup lang="ts">
import { Flex, Tab, Tabs } from '@dolanske/vui'

const activeTab = ref('Containers')
// const availableTabs = ['Servers', 'Gameservers', 'Containers']
</script>

<template>
  <Flex column gap="s">
    <h3>Network</h3>

    <!-- For some reason using v-for here causes tabs to not be clickable
    <Tabs v-model="activeTab" variant="filled">
      <Tab v-for="item in availableTabs" :key="item" :label="item" />
    </Tabs>
    -->

    <Tabs v-model="activeTab" variant="filled">
      <Tab label="Servers" />
      <Tab label="Gameservers" />
      <Tab label="Containers" />
    </Tabs>
  </Flex>
</template>
