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
const regionFilter = defineModel<SelectOption[]>('regionFilter')
const gameFilter = defineModel<SelectOption[]>('gameFilter')

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
      v-if="search || regionFilter || gameFilter"
      plain
      outline
      :expand="isBelowMedium"
      :disabled="!search && !regionFilter && !gameFilter"
      @click="clearFilters"
    >
      Clear Filters
    </Button>
  </Flex>
</template>
