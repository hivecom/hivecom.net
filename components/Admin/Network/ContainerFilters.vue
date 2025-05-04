<script setup lang="ts">
import { Button, Flex, Input, Select } from '@dolanske/vui'

interface SelectOption {
  label: string
  value: string
}

const props = defineProps<{
  search: string
  serverFilter: SelectOption[]
  statusFilter: SelectOption[]
  serverOptions: SelectOption[]
  statusOptions: SelectOption[]
}>()

const emit = defineEmits<{
  (e: 'update:search', value: string): void
  (e: 'update:serverFilter', value: SelectOption[]): void
  (e: 'update:statusFilter', value: SelectOption[]): void
  (e: 'clearFilters'): void
}>()

function clearFilters() {
  emit('clearFilters')
}

function updateSearch(value: string | number) {
  emit('update:search', String(value))
}

function updateServerFilter(value: SelectOption[] | undefined) {
  emit('update:serverFilter', value ?? [])
}

function updateStatusFilter(value: SelectOption[] | undefined) {
  emit('update:statusFilter', value ?? [])
}
</script>

<template>
  <Flex gap="s" x-start wrap>
    <Input
      :model-value="props.search"
      placeholder="Search"
      @update:model-value="updateSearch"
    >
      <template #start>
        <Icon name="ph:magnifying-glass" />
      </template>
    </Input>

    <Select
      :model-value="props.serverFilter"
      :options="props.serverOptions"
      placeholder="Filter by server"
      expand
      search
      show-clear
      @update:model-value="updateServerFilter"
    />

    <Select
      :model-value="props.statusFilter"
      :options="props.statusOptions"
      placeholder="Filter by status"
      expand
      search
      show-clear
      @update:model-value="updateStatusFilter"
    />

    <Button
      v-if="props.search || props.serverFilter.length || props.statusFilter.length"
      plain
      outline
      :disabled="!props.search && props.serverFilter.length === 0 && props.statusFilter.length === 0"
      @click="clearFilters"
    >
      Clear Filters
    </Button>
  </Flex>
</template>
