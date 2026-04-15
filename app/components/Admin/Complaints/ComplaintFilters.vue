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
const _statusFilter = defineModel<SelectOption[] | undefined>('statusFilter', { default: () => [] })
const _contextFilter = defineModel<SelectOption[] | undefined>('contextFilter', { default: () => [] })

// VUI <Select show-clear> sets the model to undefined when cleared - coerce back to []
const statusFilter = computed({
  get: () => _statusFilter.value ?? [],
  set: (v) => { _statusFilter.value = v ?? [] },
})
const contextFilter = computed({
  get: () => _contextFilter.value ?? [],
  set: (v) => { _contextFilter.value = v ?? [] },
})

const isBelowMedium = useBreakpoint('<m')

// Status filter options
const statusOptions: SelectOption[] = [
  { label: 'New (Unacknowledged)', value: 'new' },
  { label: 'Acknowledged', value: 'acknowledged' },
  { label: 'Responded', value: 'responded' },
]

// Context filter options
const contextOptions: SelectOption[] = [
  { label: 'User', value: 'user' },
  { label: 'Game Server', value: 'gameserver' },
  { label: 'Discussion', value: 'discussion' },
  { label: 'Reply', value: 'reply' },
]

// Clear all filters
function clearFilters() {
  search.value = ''
  statusFilter.value = []
  contextFilter.value = []
}

// Check if any filters are active
const hasActiveFilters = computed(() =>
  search.value.length > 0
  || statusFilter.value.length > 0
  || contextFilter.value.length > 0,
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
      show-clear
      :single="false"
    />

    <!-- Context filter -->
    <Select
      v-model="contextFilter"
      :options="contextOptions"
      placeholder="Filter by context"
      :expand="isBelowMedium"
      show-clear
      :single="false"
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
