<script setup lang="ts">
import { Button, Flex, Input, Select } from '@dolanske/vui'

interface SelectOption {
  label: string
  value: string
}

const props = defineProps<{
  statusOptions: SelectOption[]
  typeOptions: SelectOption[]
}>()

// Emit is still needed for the clearFilters action
const emit = defineEmits<{
  (e: 'clearFilters'): void
}>()

// Model values with explicit type definitions
const search = defineModel<string>('search', { default: '' })
const statusFilter = defineModel<SelectOption[]>('statusFilter')
const typeFilter = defineModel<SelectOption[]>('typeFilter')

// Clear filters handler
function clearFilters() {
  emit('clearFilters')
}

// Check if any filters are active
const hasActiveFilters = computed(() =>
  search.value.length > 0
  || (statusFilter.value && statusFilter.value.length > 0)
  || (typeFilter.value && typeFilter.value.length > 0),
)
</script>

<template>
  <Flex gap="s" x-start wrap>
    <!-- Search input -->
    <Input
      v-model="search"
      placeholder="Search referendums..."
    >
      <template #start>
        <Icon name="ph:magnifying-glass" />
      </template>
    </Input>

    <!-- Status filter -->
    <Select
      v-model="statusFilter"
      :options="props.statusOptions"
      placeholder="Filter by status"
      expand
      show-clear
    />

    <!-- Type filter -->
    <Select
      v-model="typeFilter"
      :options="props.typeOptions"
      placeholder="Filter by type"
      expand
      show-clear
    />

    <!-- Clear all filters -->
    <Button
      v-if="hasActiveFilters"
      plain
      outline
      @click="clearFilters"
    >
      Clear Filters
    </Button>
  </Flex>
</template>
