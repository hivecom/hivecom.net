<script setup lang="ts">
import { Button, Flex, Input, Select } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'

interface SelectOption {
  label: string
  value: string
}

const props = defineProps<{
  roleOptions: SelectOption[]
  statusOptions: SelectOption[]
}>()

// Emit is still needed for the clearFilters action
const emit = defineEmits<{
  (e: 'clearFilters'): void
}>()

const isBelowMedium = useBreakpoint('<m')

// Model values with explicit type definitions
const search = defineModel<string>('search', { default: '' })
const roleFilter = defineModel<SelectOption[]>('roleFilter')
const statusFilter = defineModel<SelectOption[]>('statusFilter')

// Clear filters handler
function clearFilters() {
  emit('clearFilters')
}
</script>

<template>
  <Flex gap="s" x-start wrap expand>
    <!-- Search input -->
    <Input
      v-model="search"
      placeholder="Search by username, email, or UUID"
      :expand="isBelowMedium"
    >
      <template #start>
        <Icon name="ph:magnifying-glass" />
      </template>
    </Input>

    <!-- Role filter -->
    <Select
      v-model="roleFilter"
      :options="props.roleOptions"
      placeholder="Filter by role"
      :expand="isBelowMedium"
      search
      show-clear
    />

    <!-- Status filter -->
    <Select
      v-model="statusFilter"
      :options="props.statusOptions"
      placeholder="Filter by status"
      :expand="isBelowMedium"
      search
      show-clear
    />

    <!-- Clear all filters -->
    <Button
      v-if="search || roleFilter || statusFilter"
      plain
      outline
      :expand="isBelowMedium"
      :disabled="!search && !roleFilter && !statusFilter"
      @click="clearFilters"
    >
      Clear Filters
    </Button>
  </Flex>
</template>
