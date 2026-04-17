<script setup lang="ts">
import { Button, Flex, Input } from '@dolanske/vui'

defineProps<{
  expand?: boolean
}>()

const search = defineModel<string>('search', { default: '' })

function clearFilters() {
  search.value = ''
}

const hasFilters = computed(() => !!search.value)
</script>

<template>
  <Flex gap="s" y-center :expand>
    <Input
      v-model="search"
      :expand
      name="search"
      placeholder="Search themes..."
    >
      <template #start>
        <Icon name="ph:magnifying-glass" />
      </template>
    </Input>

    <Button
      v-if="hasFilters"
      variant="gray"
      square
      @click="clearFilters"
    >
      <Icon name="ph:x" />
    </Button>
  </Flex>
</template>
