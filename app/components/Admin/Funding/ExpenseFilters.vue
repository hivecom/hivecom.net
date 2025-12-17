<script setup lang="ts">
import { Button, Flex, Input } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'

// Define models for filter values
const search = defineModel<string>('search', { default: '' })

const isBelowMedium = useBreakpoint('<m')

// Clear all filters
function clearFilters() {
  search.value = ''
}
</script>

<template>
  <Flex gap="s" wrap expand>
    <!-- Search Input -->
    <Input
      v-model="search"
      placeholder="Search expenses..."
      :expand="isBelowMedium"
    >
      <template #start>
        <Icon name="ph:magnifying-glass" />
      </template>
    </Input>

    <!-- Clear filters button -->
    <Button v-if="search" :expand="isBelowMedium" @click="clearFilters">
      Clear Filters
    </Button>
  </Flex>
</template>
