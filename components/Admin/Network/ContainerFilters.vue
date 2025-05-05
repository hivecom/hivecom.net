<script setup lang="ts">
import { Button, Flex, Input, Select } from '@dolanske/vui'

interface SelectOption {
  label: string
  value: string
}

const props = defineProps<{
  serverOptions: SelectOption[]
  statusOptions: SelectOption[]
}>()
// Emit is still needed for the clearFilters action
const emit = defineEmits<{
  (e: 'clearFilters'): void
}>()
// Use defineModel with explicit type definitions
const search = defineModel<string>('search', { default: '' })
const serverFilter = defineModel<SelectOption[]>('serverFilter', { default: () => [] })
const statusFilter = defineModel<SelectOption[]>('statusFilter', { default: () => [] })

function clearFilters() {
  emit('clearFilters')
}
</script>

<template>
  <Flex gap="s" x-start wrap>
    <Input
      v-model="search"
      placeholder="Search"
    >
      <template #start>
        <Icon name="ph:magnifying-glass" />
      </template>
    </Input>

    <Select
      v-model="serverFilter"
      :options="props.serverOptions"
      placeholder="Filter by server"
      expand
      search
      show-clear
    />

    <Select
      v-model="statusFilter"
      :options="props.statusOptions"
      placeholder="Filter by status"
      expand
      search
      show-clear
    />

    <Button
      v-if="search || serverFilter.length || statusFilter.length"
      plain
      outline
      :disabled="!search && serverFilter.length === 0 && statusFilter.length === 0"
      @click="clearFilters"
    >
      Clear Filters
    </Button>
  </Flex>
</template>
