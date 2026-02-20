<script setup lang="ts">
import { Button, Flex, Input, Select } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'

interface SelectOption {
  label: string
  value: string
}

const props = defineProps<{
  statusOptions: SelectOption[]
  contextOptions: SelectOption[]
}>()

const emit = defineEmits<{
  (e: 'clearFilters'): void
}>()

const isBelowMedium = useBreakpoint('<m')

const search = defineModel<string>('search', { default: '' })
const statusFilter = defineModel<SelectOption[]>('statusFilter')
const contextFilter = defineModel<SelectOption[]>('contextFilter')

function clearFilters() {
  emit('clearFilters')
}

const hasActiveFilters = computed(() =>
  search.value.length > 0
  || (statusFilter.value && statusFilter.value.length > 0)
  || (contextFilter.value && contextFilter.value.length > 0),
)
</script>

<template>
  <Flex gap="s" x-start wrap expand>
    <Input
      v-model="search"
      placeholder="Search discussions..."
      :expand="isBelowMedium"
    >
      <template #start>
        <Icon name="ph:magnifying-glass" />
      </template>
    </Input>

    <Select
      v-model="statusFilter"
      :options="props.statusOptions"
      placeholder="Filter by status"
      :expand="isBelowMedium"
      show-clear
      :single="false"
    />

    <Select
      v-model="contextFilter"
      :options="props.contextOptions"
      placeholder="Filter by context"
      :expand="isBelowMedium"
      show-clear
      :single="false"
    />

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
