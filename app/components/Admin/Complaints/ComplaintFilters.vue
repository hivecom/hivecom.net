<script setup lang="ts">
import { Button, Flex, Input, Select } from '@dolanske/vui'

// Interface for Select options
interface SelectOption {
  label: string
  value: string
}

// Define models for filter values
const search = defineModel<string>('search', { default: '' })
const statusFilter = defineModel<SelectOption[]>('statusFilter', { default: () => [] })

// Status filter options
const statusOptions: SelectOption[] = [
  { label: 'New (Unacknowledged)', value: 'new' },
  { label: 'Acknowledged', value: 'acknowledged' },
  { label: 'Responded', value: 'responded' },
]

// Clear all filters
function clearFilters() {
  search.value = ''
  statusFilter.value = []
}

// Check if any filters are active
const hasActiveFilters = computed(() =>
  search.value.length > 0 || statusFilter.value.length > 0,
)
</script>

<template>
  <Flex gap="m" wrap>
    <!-- Search Input -->
    <Input
      v-model="search"
      placeholder="Search complaint messages..."
      class="search-input"
    >
      <template #start>
        <Icon name="ph:magnifying-glass" />
      </template>
    </Input>

    <!-- Status filter -->
    <Select
      v-model="statusFilter"
      :options="statusOptions"
      placeholder="Filter by status"
      expand
      search
      show-clear
    />

    <!-- Clear filters button -->
    <Button
      v-if="hasActiveFilters"
      variant="gray"
      @click="clearFilters"
    >
      Clear Filters
    </Button>
  </Flex>
</template>

<style scoped lang="scss">
.search-input {
  min-width: 300px;
  flex-grow: 1;
}
</style>
