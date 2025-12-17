<script setup lang="ts">
import { Flex, Input } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'

// Define model for search
const search = defineModel<string>('search', { default: '' })

const isBelowMedium = useBreakpoint('<m')
</script>

<template>
  <Flex gap="s" y-center wrap expand>
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
  </Flex>
</template>
