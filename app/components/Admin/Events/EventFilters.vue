<script setup lang="ts">
import { Flex, Input } from '@dolanske/vui'

// Define model for search
const search = defineModel<string>('search', { default: '' })
</script>

<template>
  <Flex gap="s" y-center>
    <Input
      v-model="search"
      placeholder="Search events..."
      style="min-width: 300px;"
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
