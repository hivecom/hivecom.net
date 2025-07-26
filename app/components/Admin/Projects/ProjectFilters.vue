<script setup lang="ts">
import { Button, Flex, Input, Select } from '@dolanske/vui'

interface SelectOption {
  label: string
  value: string
}

const props = defineProps<{
  tagOptions: SelectOption[]
}>()

// Emit is still needed for the clearFilters action
const emit = defineEmits<{
  (e: 'clearFilters'): void
}>()

// Model values with explicit type definitions
const search = defineModel<string>('search', { default: '' })
const tagFilter = defineModel<SelectOption[]>('tagFilter')

// Clear filters handler
function clearFilters() {
  emit('clearFilters')
}

// Check if any filters are active
const hasActiveFilters = computed(() =>
  search.value.length > 0
  || (tagFilter.value && tagFilter.value.length > 0),
)
</script>

<template>
  <Flex gap="s" x-start wrap>
    <!-- Search input -->
    <Input
      v-model="search"
      placeholder="Search projects..."
    >
      <template #start>
        <Icon name="ph:magnifying-glass" />
      </template>
    </Input>

    <!-- Tag filter -->
    <Select
      v-model="tagFilter"
      :options="props.tagOptions"
      placeholder="Filter by tags"
      expand
      search
      show-clear
      :single="false"
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
