<script setup lang="ts">
import { Button, Flex, Input, Select } from '@dolanske/vui'

interface SelectOption {
  label: string
  value: string
}

const props = defineProps<{
  statusOptions: SelectOption[]
}>()

// Emit is still needed for the clearFilters action
const emit = defineEmits<{
  (e: 'clearFilters'): void
}>()

// Model values with explicit type definitions
const search = defineModel<string>('search', { default: '' })
const statusFilter = defineModel<SelectOption[]>('statusFilter')

// Clear filters handler
function clearFilters() {
  emit('clearFilters')
}
</script>

<template>
  <Flex gap="s" x-start wrap>
    <!-- Search input -->
    <Input
      v-model="search"
      placeholder="Search servers..."
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
      search
      show-clear
    />

    <!-- Clear all filters -->
    <Button
      v-if="search || statusFilter"
      plain
      outline
      :disabled="!search && !statusFilter"
      @click="clearFilters"
    >
      Clear Filters
    </Button>
  </Flex>
</template>
