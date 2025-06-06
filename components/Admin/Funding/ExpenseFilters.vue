<script setup lang="ts">
import { Button, Flex, Input } from '@dolanske/vui'

// Define models for filter values
const search = defineModel<string>('search', { default: '' })

// Clear all filters
function clearFilters() {
  search.value = ''
}
</script>

<template>
  <Flex gap="m" wrap>
    <!-- Search Input -->
    <Input
      v-model="search"
      placeholder="Search expenses..."
      class="search-input"
    >
      <template #start>
        <Icon name="ph:magnifying-glass" />
      </template>
    </Input>

    <!-- Clear filters button -->
    <Button v-if="search" @click="clearFilters">
      Clear Filters
    </Button>
  </Flex>
</template>

<style scoped>
.search-input {
  min-width: 300px;
  flex-grow: 1;
}
</style>
