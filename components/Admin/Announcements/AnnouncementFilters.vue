<script setup lang="ts">
import { Button, Flex, Input, Select } from '@dolanske/vui'

interface SelectOption {
  label: string
  value: string
}

const props = defineProps<{
  pinnedOptions: SelectOption[]
}>()

// Emit is still needed for the clearFilters action
const emit = defineEmits<{
  (e: 'clearFilters'): void
}>()

// Model values with explicit type definitions
const search = defineModel<string>('search', { default: '' })
const pinnedFilter = defineModel<SelectOption[]>('pinnedFilter')

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
      placeholder="Search announcements..."
    >
      <template #start>
        <Icon name="ph:magnifying-glass" />
      </template>
    </Input>

    <!-- Pinned filter -->
    <Select
      v-model="pinnedFilter"
      :options="props.pinnedOptions"
      placeholder="Filter by pinned status"
      expand
      search
      show-clear
    />

    <!-- Clear all filters -->
    <Button
      v-if="search || pinnedFilter"
      plain
      outline
      :disabled="!search && !pinnedFilter"
      @click="clearFilters"
    >
      Clear Filters
    </Button>
  </Flex>
</template>
