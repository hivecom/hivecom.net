<script setup lang="ts">
import { Button, Flex, Input, Select } from '@dolanske/vui'
import { computed } from 'vue'
import { useBreakpoint } from '@/lib/mediaQuery'

interface SelectOption {
  label: string
  value: string
}

const props = defineProps<{
  roleOptions: SelectOption[]
  statusOptions: SelectOption[]
}>()

const emit = defineEmits<{
  (e: 'clearFilters'): void
  (e: 'searchEnter'): void
}>()

const isBelowMedium = useBreakpoint('<m')

const search = defineModel<string>('search', { default: '' })
const roleFilter = defineModel<string>('roleFilter', { default: '' })
const statusFilter = defineModel<string>('statusFilter', { default: '' })

// VUI Select speaks SelectOption[] - bridge to/from plain string models

const roleSelectModel = computed({
  get: () => roleFilter.value !== '' ? props.roleOptions.filter(o => o.value === roleFilter.value) : [],
  set: (val: SelectOption[] | undefined) => {
    roleFilter.value = val && val.length > 0 ? (val[0]?.value ?? '') : ''
  },
})

const statusSelectModel = computed({
  get: () => statusFilter.value !== '' ? props.statusOptions.filter(o => o.value === statusFilter.value) : [],
  set: (val: SelectOption[] | undefined) => {
    statusFilter.value = val && val.length > 0 ? (val[0]?.value ?? '') : ''
  },
})

function clearFilters() {
  emit('clearFilters')
}
</script>

<template>
  <Flex gap="s" x-start wrap expand>
    <Input v-model="search" style="min-width: 16vw" placeholder="Search by username, email, or UUID" :expand="isBelowMedium" @keydown.enter.prevent="emit('searchEnter')">
      <template #start>
        <Icon name="ph:magnifying-glass" />
      </template>
    </Input>
    <Select v-model="roleSelectModel" :options="props.roleOptions" placeholder="Filter by role" :expand="isBelowMedium" show-clear />
    <Select v-model="statusSelectModel" :options="props.statusOptions" placeholder="Filter by status" :expand="isBelowMedium" show-clear />
    <Button v-if="search || roleFilter || statusFilter" plain outline :expand="isBelowMedium" :disabled="!search && !roleFilter && !statusFilter" @click="clearFilters">
      Clear Filters
    </Button>
  </Flex>
</template>
