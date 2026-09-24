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
}>()

const emit = defineEmits<{
  (e: 'clearFilters'): void
}>()

const isBelowMedium = useBreakpoint('<m')

const search = defineModel<string>('search', { default: '' })
const _statusFilter = defineModel<SelectOption[] | undefined>('statusFilter')

// VUI <Select show-clear> sets the model to undefined on clear. Coerce it back to [].
const statusFilter = computed({
  get: () => _statusFilter.value ?? [],
  set: (v) => { _statusFilter.value = v ?? [] },
})

function clearFilters() {
  emit('clearFilters')
}
</script>

<template>
  <Flex gap="s" x-start wrap expand>
    <Input
      v-model="search"
      placeholder="Search servers..."
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
      search
      show-clear
    />

    <Button
      v-if="search || statusFilter.length > 0"
      plain
      outline
      :expand="isBelowMedium"
      :disabled="!search && statusFilter.length === 0"
      @click="clearFilters"
    >
      Clear Filters
    </Button>
  </Flex>
</template>
