<script setup lang="ts">
import { Button, Flex, Input, Select } from '@dolanske/vui'
import AuthorFilter from '@/components/Admin/Shared/AuthorFilter.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

interface ProfileResult {
  id: string
  username: string
}

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
const _statusFilter = defineModel<SelectOption[] | undefined>('statusFilter')
const _contextFilter = defineModel<SelectOption[] | undefined>('contextFilter')

// VUI <Select show-clear> sets the model to undefined when cleared - coerce back to []
const statusFilter = computed({
  get: () => _statusFilter.value ?? [],
  set: (v) => { _statusFilter.value = v ?? [] },
})
const contextFilter = computed({
  get: () => _contextFilter.value ?? [],
  set: (v) => { _contextFilter.value = v ?? [] },
})
const authorFilter = defineModel<ProfileResult | null>('authorFilter', { default: null })

function clearFilters() {
  emit('clearFilters')
}

const hasActiveFilters = computed(() =>
  search.value.length > 0
  || (statusFilter.value && statusFilter.value.length > 0)
  || (contextFilter.value && contextFilter.value.length > 0)
  || authorFilter.value !== null,
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

    <Flex y-center :gap="isBelowMedium ? 's' : 'xs'" :expand="isBelowMedium">
      <AuthorFilter v-model="authorFilter" />
    </Flex>

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
