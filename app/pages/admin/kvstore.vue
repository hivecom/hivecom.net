<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import KVStoreTable from '@/components/Admin/KVStore/KVStoreTable.vue'
</script>

<template>
  <Flex column gap="l">
    <Flex column :gap="0">
      <h1>KV Store</h1>
      <p class="text-color-light">
        Manage simple key/value pairs used across the site
      </p>
    </Flex>

    <KVStoreTable />
  </Flex>
</template>
