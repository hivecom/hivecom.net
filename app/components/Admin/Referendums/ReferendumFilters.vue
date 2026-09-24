<script setup lang="ts">
import { Button, Flex, Input } from '@dolanske/vui'
import ExpandableSelect from '@/components/Shared/ExpandableSelect.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

interface SelectOption {
  label: string
  value: string
}

const props = defineProps<{
  statusOptions: SelectOption[]
  typeOptions: SelectOption[]
  visibilityOptions: SelectOption[]
}>()

const emit = defineEmits<{
  (e: 'clearFilters'): void
}>()

const isBelowMedium = useBreakpoint('<m')

const search = defineModel<string>('search', { default: '' })
const _statusFilter = defineModel<SelectOption[] | undefined>('statusFilter', { default: () => [] })
const _typeFilter = defineModel<SelectOption[] | undefined>('typeFilter', { default: () => [] })
const _visibilityFilter = defineModel<SelectOption[] | undefined>('visibilityFilter', { default: () => [] })

// VUI <Select show-clear> sets the model to undefined on clear. Coerce it back to [].
const statusFilter = computed({
  get: () => _statusFilter.value ?? [],
  set: (v) => { _statusFilter.value = v ?? [] },
})
const typeFilter = computed({
  get: () => _typeFilter.value ?? [],
  set: (v) => { _typeFilter.value = v ?? [] },
})
const visibilityFilter = computed({
  get: () => _visibilityFilter.value ?? [],
  set: (v) => { _visibilityFilter.value = v ?? [] },
})

function clearFilters() {
  emit('clearFilters')
}

const hasActiveFilters = computed(() =>
  search.value.length > 0
  || (statusFilter.value && statusFilter.value.length > 0)
  || (typeFilter.value && typeFilter.value.length > 0)
  || (visibilityFilter.value && visibilityFilter.value.length > 0),
)
</script>

<template>
  <Flex gap="s" x-start wrap expand>
    <Input
      v-model="search"
      placeholder="Search referendums..."
      :expand="isBelowMedium"
    >
      <template #start>
        <Icon name="ph:magnifying-glass" />
      </template>
    </Input>

    <ExpandableSelect
      v-model="statusFilter"
      :options="props.statusOptions"
      placeholder="Filter by status"
      :expand="isBelowMedium"
      show-clear
      :single="false"
    />

    <ExpandableSelect
      v-model="typeFilter"
      :options="props.typeOptions"
      placeholder="Filter by type"
      :expand="isBelowMedium"
      show-clear
      :single="false"
    />

    <ExpandableSelect
      v-model="visibilityFilter"
      :options="props.visibilityOptions"
      placeholder="Filter by visibility"
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
