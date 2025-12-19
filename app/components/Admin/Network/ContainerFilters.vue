<script setup lang="ts">
import { Button, Flex, Input, Select } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'

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
const serverFilter = defineModel<SelectOption[]>('serverFilter')
const statusFilter = defineModel<SelectOption[]>('statusFilter')

const isBelowMedium = useBreakpoint('<m')

function clearFilters() {
  emit('clearFilters')
}
</script>

<template>
  <Flex gap="s" x-start wrap expand>
    <Input
      v-model="search"
      placeholder="Search containers..."
      :expand="isBelowMedium"
    >
      <template #start>
        <Icon name="ph:magnifying-glass" />
      </template>
    </Input>

    <Select
      v-model="serverFilter"
      :options="props.serverOptions"
      placeholder="Filter by server"
      :expand="isBelowMedium"
      search
      show-clear
    />

    <Select
      v-model="statusFilter"
      :options="props.statusOptions"
      placeholder="Filter by status"
      :expand="isBelowMedium"
      search
      show-clear
    />

    <Button
      v-if="search || serverFilter || statusFilter"
      plain
      outline
      :expand="isBelowMedium"
      :disabled="!search && !serverFilter && !statusFilter"
      @click="clearFilters"
    >
      Clear Filters
    </Button>
  </Flex>
</template>
