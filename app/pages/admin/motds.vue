<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import MOTDTable from '@/components/Admin/MOTDs/MOTDTable.vue'
</script>

<template>
  <Flex column gap="l">
    <Flex column :gap="0">
      <h1>MOTDs</h1>
      <p class="text-color-light">
        Add and manage "Messages of the Day" displayed as an easter egg on the landing page
      </p>
    </Flex>

    <MOTDTable />
  </Flex>
</template>
