<script setup lang="ts">
import { Button, Flex, Input } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'

const search = defineModel<string>('search', { default: '' })

const isBelowMedium = useBreakpoint('<m')

function clearFilters() {
  search.value = ''
}
</script>

<template>
  <Flex gap="s" wrap expand>
    <Input
      v-model="search"
      placeholder="Search expenses..."
      :expand="isBelowMedium"
    >
      <template #start>
        <Icon name="ph:magnifying-glass" />
      </template>
    </Input>

    <Button v-if="search" :expand="isBelowMedium" @click="clearFilters">
      Clear Filters
    </Button>
  </Flex>
</template>
