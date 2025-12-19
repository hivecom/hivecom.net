<script setup lang="ts">
import { Button, Flex, Input, Select } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'

// Interface for Select options
interface SelectOption {
  label: string
  value: string
}

// Define models for filter values
const search = defineModel<string>('search', { default: '' })
const statusFilter = defineModel<SelectOption[]>('statusFilter', { default: () => [] })

const isBelowMedium = useBreakpoint('<m')

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
  <Flex gap="s" wrap expand>
    <!-- Search Input -->
    <Input
      v-model="search"
      placeholder="Search complaint messages..."
      :expand="isBelowMedium"
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
      :expand="isBelowMedium"
      search
      show-clear
    />

    <!-- Clear filters button -->
    <Button
      v-if="hasActiveFilters"
      variant="gray"
      :expand="isBelowMedium"
      @click="clearFilters"
    >
      Clear Filters
    </Button>
  </Flex>
</template>
