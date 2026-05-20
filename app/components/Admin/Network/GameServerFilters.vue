<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Button, Flex, Input, Select } from '@dolanske/vui'
import { computed } from 'vue'
import GameSelect from '@/components/Shared/GameSelect.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{
  regionOptions: { label: string, value: string }[]
  gameEntries: Tables<'games'>[]
}>()

const emit = defineEmits<{
  (e: 'clearFilters'): void
}>()

const isBelowMedium = useBreakpoint('<m')

const search = defineModel<string>('search', { default: '' })
const _regionFilter = defineModel<{ label: string, value: string }[] | undefined>('regionFilter')
const gameFilter = defineModel<number[]>('gameFilter', { default: () => [] })

const regionFilter = computed({
  get: () => _regionFilter.value ?? [],
  set: (v) => { _regionFilter.value = v ?? [] },
})

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
    <GameSelect
      v-model="gameFilter"
      :games="props.gameEntries"
      placeholder="Filter by game"
      :expand="isBelowMedium"
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
