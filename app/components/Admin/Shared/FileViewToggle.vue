<script setup lang="ts">
import { Button, ButtonGroup } from '@dolanske/vui'

withDefaults(defineProps<{
  // When expanded the buttons fill their container (mobile layouts).
  expand?: boolean
}>(), {
  expand: false,
})

// Table/grid switch shared by the Assets and Depot file views so both render the
// same control. Flat view stays Assets-specific and lives beside this toggle.
const viewMode = defineModel<'table' | 'grid'>({ required: true })
</script>

<template>
  <ButtonGroup :expand="expand">
    <Button
      size="s"
      :variant="viewMode === 'grid' ? 'accent' : 'gray'"
      :square="!expand"
      :expand="expand"
      @click="viewMode = 'grid'"
    >
      <Icon name="ph:squares-four" />
    </Button>
    <Button
      size="s"
      :variant="viewMode === 'table' ? 'accent' : 'gray'"
      :square="!expand"
      :expand="expand"
      @click="viewMode = 'table'"
    >
      <Icon name="ph:list" />
    </Button>
  </ButtonGroup>
</template>
