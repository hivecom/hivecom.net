<script setup lang="ts">
import { Button, Flex, Input } from '@dolanske/vui'
import ExpandableSelect from '@/components/Shared/ExpandableSelect.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

interface SelectOption {
  label: string
  value: string
}

const search = defineModel<string>('search', { default: '' })
const _statusFilter = defineModel<SelectOption[] | undefined>('statusFilter', { default: () => [] })
const _contextFilter = defineModel<SelectOption[] | undefined>('contextFilter', { default: () => [] })

// VUI <Select show-clear> sets the model to undefined on clear. Coerce it back to [].
const statusFilter = computed({
  get: () => _statusFilter.value ?? [],
  set: (v) => { _statusFilter.value = v ?? [] },
})
const contextFilter = computed({
  get: () => _contextFilter.value ?? [],
  set: (v) => { _contextFilter.value = v ?? [] },
})

const isBelowMedium = useBreakpoint('<m')

const statusOptions: SelectOption[] = [
  { label: 'New (Unacknowledged)', value: 'new' },
  { label: 'Acknowledged', value: 'acknowledged' },
  { label: 'Responded', value: 'responded' },
]

const contextOptions: SelectOption[] = [
  { label: 'User', value: 'user' },
  { label: 'Game Server', value: 'gameserver' },
  { label: 'Discussion', value: 'discussion' },
  { label: 'Reply', value: 'reply' },
]

function clearFilters() {
  search.value = ''
  statusFilter.value = []
  contextFilter.value = []
}

const hasActiveFilters = computed(() =>
  search.value.length > 0
  || statusFilter.value.length > 0
  || contextFilter.value.length > 0,
)
</script>

<template>
  <Flex gap="s" wrap expand>
    <Input
      v-model="search"
      placeholder="Search complaint messages..."
      :expand="isBelowMedium"
    >
      <template #start>
        <Icon name="ph:magnifying-glass" />
      </template>
    </Input>

    <ExpandableSelect
      v-model="statusFilter"
      :options="statusOptions"
      placeholder="Filter by status"
      :expand="isBelowMedium"
      show-clear
      :single="false"
    />

    <ExpandableSelect
      v-model="contextFilter"
      :options="contextOptions"
      placeholder="Filter by context"
      :expand="isBelowMedium"
      show-clear
      :single="false"
    />

    <Button
      v-if="hasActiveFilters"
      variant="gray"
      :expand="isBelowMedium"
      @click="clearFilters"
    >
      Clear Filters
    </Button>
  </Flex>
</template>
