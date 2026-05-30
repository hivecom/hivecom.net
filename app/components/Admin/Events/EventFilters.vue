<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Flex, Input, Select, Switch } from '@dolanske/vui'
import GameSelect from '@/components/Shared/GameSelect.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{
  games: Tables<'games'>[]
}>()

const search = defineModel<string>('search', { default: '' })
const isOfficial = defineModel<boolean | null>('isOfficial', { default: null })
const isRecurring = defineModel<boolean | null>('isRecurring', { default: null })
const gameFilter = defineModel<number[]>('gameFilter', { default: () => [] })

const isBelowMedium = useBreakpoint('<m')

interface SelectOption {
  label: string
  value: string
}

const officialOptions: SelectOption[] = [
  { label: 'Official', value: 'true' },
  { label: 'Non-official', value: 'false' },
]

// VUI Select uses an array for multi (or single) select; we use a single-select with show-clear.
// Map between boolean | null and SelectOption[] for the VUI Select component.
const officialSelection = computed<SelectOption[]>({
  get() {
    if (isOfficial.value === null)
      return []
    return officialOptions.filter(o => o.value === String(isOfficial.value))
  },
  set(val) {
    if (!val || val.length === 0 || val[0] === undefined) {
      isOfficial.value = null
    }
    else {
      isOfficial.value = val[0].value === 'true'
    }
  },
})

const hideRecurring = computed<boolean>({
  get() {
    return isRecurring.value === true
  },
  set(val) {
    isRecurring.value = val ? true : null
  },
})
</script>

<template>
  <Flex gap="s" y-center wrap :expand="isBelowMedium">
    <Input
      v-model="search"
      placeholder="Search events..."
      :expand="isBelowMedium"
    >
      <template #start>
        <Icon name="ph:magnifying-glass" />
      </template>
      <template v-if="search" #end>
        <button
          type="button"
          @click="search = ''"
        >
          <Icon name="ph:x" />
        </button>
      </template>
    </Input>

    <Select
      v-model="officialSelection"
      :options="officialOptions"
      placeholder="Filter by official"
      :class="{ 'w-100': isBelowMedium }"
      show-clear
      :single="true"
    />

    <GameSelect
      v-model="gameFilter"
      :games="props.games"
      placeholder="Game"
      :expand="isBelowMedium"
    />

    <Flex gap="xs" y-center>
      <Switch v-model="hideRecurring" />
      <span class="text-s text-color-light">Hide recurring</span>
    </Flex>
  </Flex>
</template>
