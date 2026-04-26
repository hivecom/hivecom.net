<script setup lang="ts">
import { Flex, Input, Select } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'

const search = defineModel<string>('search', { default: '' })
const isOfficial = defineModel<boolean | null>('isOfficial', { default: null })

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
      :expand="isBelowMedium"
      show-clear
      :single="true"
    />
  </Flex>
</template>
