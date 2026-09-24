<script setup lang="ts">
import { Button, Flex, Input } from '@dolanske/vui'
import ExpandableSelect from '@/components/Shared/ExpandableSelect.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

interface SelectOption {
  label: string
  value: string
}

const props = defineProps<{
  tagOptions: SelectOption[]
}>()

const emit = defineEmits<{
  (e: 'clearFilters'): void
}>()

const isBelowMedium = useBreakpoint('<m')

const search = defineModel<string>('search', { default: '' })
const _tagFilter = defineModel<SelectOption[] | undefined>('tagFilter')

// VUI <Select show-clear> sets the model to undefined on clear. Coerce it back to [].
const tagFilter = computed({
  get: () => _tagFilter.value ?? [],
  set: (v) => { _tagFilter.value = v ?? [] },
})

function clearFilters() {
  emit('clearFilters')
}

const hasActiveFilters = computed(() =>
  search.value.length > 0
  || (tagFilter.value && tagFilter.value.length > 0),
)
</script>

<template>
  <Flex gap="s" x-start wrap expand>
    <Input
      v-model="search"
      placeholder="Search projects..."
      :expand="isBelowMedium"
    >
      <template #start>
        <Icon name="ph:magnifying-glass" />
      </template>
    </Input>

    <ExpandableSelect
      v-model="tagFilter"
      :options="props.tagOptions"
      placeholder="Filter by tags"
      :expand="isBelowMedium"
      search
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
