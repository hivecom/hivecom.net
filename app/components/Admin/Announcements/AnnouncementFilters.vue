<script setup lang="ts">
import { Button, Flex, Input, Select } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'

interface SelectOption {
  label: string
  value: string
}

const props = defineProps<{
  pinnedOptions: SelectOption[]
  tagOptions: SelectOption[]
}>()

// Emit is still needed for the clearFilters action
const emit = defineEmits<{
  (e: 'clearFilters'): void
}>()

const isBelowMedium = useBreakpoint('<m')

// Model values with explicit type definitions
const search = defineModel<string>('search', { default: '' })
const pinnedFilter = defineModel<SelectOption[]>('pinnedFilter')
const tagFilter = defineModel<SelectOption[]>('tagFilter')

// Clear filters handler
function clearFilters() {
  emit('clearFilters')
}

// Check if any filters are active
const hasActiveFilters = computed(() =>
  search.value.length > 0
  || (pinnedFilter.value && pinnedFilter.value.length > 0)
  || (tagFilter.value && tagFilter.value.length > 0),
)
</script>

<template>
  <Flex gap="s" x-start wrap expand>
    <!-- Search input -->
    <Input
      v-model="search"
      placeholder="Search announcements..."
      :expand="isBelowMedium"
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
      :expand="isBelowMedium"
      search
      show-clear
    />

    <!-- Tag filter -->
    <Select
      v-model="tagFilter"
      :options="props.tagOptions"
      placeholder="Filter by tags"
      :expand="isBelowMedium"
      search
      show-clear
      :single="false"
    />

    <!-- Clear all filters -->
    <Button
      v-if="hasActiveFilters"
      plain
      outline
      :expand="isBelowMedium"
      @click="clearFilters"
    >
      Clear Filters
    </Button>
  </Flex>
</template>
