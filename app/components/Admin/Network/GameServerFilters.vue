<script setup lang="ts">
import { Button, Flex, Input, Select } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'

interface SelectOption {
  label: string
  value: string
}

const props = defineProps<{
  regionOptions: SelectOption[]
  gameOptions: SelectOption[]
}>()

// Emit is still needed for the clearFilters action
const emit = defineEmits<{
  (e: 'clearFilters'): void
}>()

const isBelowMedium = useBreakpoint('<m')

// Model values with explicit type definitions
const search = defineModel<string>('search', { default: '' })
const _regionFilter = defineModel<SelectOption[] | undefined>('regionFilter')
const _gameFilter = defineModel<SelectOption[] | undefined>('gameFilter')

// VUI <Select show-clear> sets the model to undefined when cleared - coerce back to []
const regionFilter = computed({
  get: () => _regionFilter.value ?? [],
  set: (v) => { _regionFilter.value = v ?? [] },
})
const gameFilter = computed({
  get: () => _gameFilter.value ?? [],
  set: (v) => { _gameFilter.value = v ?? [] },
})

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
      placeholder="Search game servers..."
      :expand="isBelowMedium"
    >
      <template #start>
        <Icon name="ph:magnifying-glass" />
      </template>
    </Input>

    <!-- Game filter -->
    <Select
      v-model="gameFilter"
      :options="props.gameOptions"
      placeholder="Filter by game"
      :expand="isBelowMedium"
      search
      show-clear
    />

    <!-- Region filter -->
    <Select
      v-model="regionFilter"
      :options="props.regionOptions"
      placeholder="Filter by region"
      :expand="isBelowMedium"
      search
      show-clear
    />

    <!-- Clear all filters -->
    <Button
      v-if="search || regionFilter.length > 0 || gameFilter.length > 0"
      plain
      outline
      :expand="isBelowMedium"
      :disabled="!search && regionFilter.length === 0 && gameFilter.length === 0"
      @click="clearFilters"
    >
      Clear Filters
    </Button>
  </Flex>
</template>
