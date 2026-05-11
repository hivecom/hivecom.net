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
  providerOptions: SelectOption[]
  platformOptions: SelectOption[]
  countryOptions: SelectOption[]
}>()

const emit = defineEmits<{
  (e: 'clearFilters'): void
  (e: 'searchEnter'): void
}>()

const isBelowMedium = useBreakpoint('<m')

const search = defineModel<string>('search', { default: '' })
const roleFilter = defineModel<string>('roleFilter', { default: '' })
const statusFilter = defineModel<string>('statusFilter', { default: '' })
const providerFilter = defineModel<string>('providerFilter', { default: '' })
const platformFilter = defineModel<string>('platformFilter', { default: '' })

const supporterFilter = defineModel<string>('supporterFilter', { default: '' })
const countryFilter = defineModel<string>('countryFilter', { default: '' })

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

const providerSelectModel = computed({
  get: () => providerFilter.value !== '' ? props.providerOptions.filter(o => o.value === providerFilter.value) : [],
  set: (val: SelectOption[] | undefined) => {
    providerFilter.value = val && val.length > 0 ? (val[0]?.value ?? '') : ''
  },
})

const platformSelectModel = computed({
  get: () => platformFilter.value !== '' ? props.platformOptions.filter(o => o.value === platformFilter.value) : [],
  set: (val: SelectOption[] | undefined) => {
    platformFilter.value = val && val.length > 0 ? (val[0]?.value ?? '') : ''
  },
})

const supporterOptions: SelectOption[] = [
  { label: 'Supporter', value: 'true' },
  { label: 'Non-supporter', value: 'false' },
]

const supporterSelectModel = computed({
  get: () => supporterFilter.value !== '' ? supporterOptions.filter(o => o.value === supporterFilter.value) : [],
  set: (val: SelectOption[] | undefined) => {
    supporterFilter.value = val && val.length > 0 ? (val[0]?.value ?? '') : ''
  },
})

const countrySelectModel = computed({
  get: () => countryFilter.value !== '' ? props.countryOptions.filter(o => o.value === countryFilter.value) : [],
  set: (val: Array<{ label: string, value: string }> | undefined) => {
    countryFilter.value = val && val.length > 0 ? (val[0]?.value ?? '') : ''
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
    <Select v-model="roleSelectModel" :options="props.roleOptions" placeholder="Role" :expand="isBelowMedium" show-clear />
    <Select v-model="statusSelectModel" :options="props.statusOptions" placeholder="Status" :expand="isBelowMedium" show-clear />
    <Select v-model="providerSelectModel" :options="props.providerOptions" placeholder="Auth provider" :expand="isBelowMedium" show-clear />
    <Select v-model="platformSelectModel" :options="props.platformOptions" placeholder="Platform" :expand="isBelowMedium" show-clear />
    <Select v-model="supporterSelectModel" :options="supporterOptions" placeholder="Supporter" :expand="isBelowMedium" show-clear />
    <Select v-model="countrySelectModel" :options="props.countryOptions" placeholder="Country" :expand="isBelowMedium" show-clear searchable />
    <Button v-if="search || roleFilter || statusFilter || providerFilter || platformFilter || supporterFilter || countryFilter" plain outline :expand="isBelowMedium" :disabled="!search && !roleFilter && !statusFilter && !providerFilter && !platformFilter && !supporterFilter && !countryFilter" @click="clearFilters">
      Clear Filters
    </Button>
  </Flex>
</template>
