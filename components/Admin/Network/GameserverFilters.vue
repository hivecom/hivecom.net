<script setup lang="ts">
import { Button, Flex, Input, Select } from '@dolanske/vui'

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
  <Flex gap="s" x-start wrap>
    <!-- Search input -->
    <Input
      v-model="search"
      placeholder="Search gameservers..."
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
      expand
      search
      show-clear
    />

    <!-- Region filter -->
    <Select
      v-model="regionFilter"
      :options="props.regionOptions"
      placeholder="Filter by region"
      expand
      search
      show-clear
    />

    <!-- Clear all filters -->
    <Button
      v-if="search || regionFilter || gameFilter"
      plain
      outline
      :disabled="!search && !regionFilter && !gameFilter"
      @click="clearFilters"
    >
      Clear Filters
    </Button>
  </Flex>
</template>
