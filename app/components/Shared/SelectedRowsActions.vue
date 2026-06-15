<script setup lang="ts">
import { Button, ButtonGroup, Dropdown, Flex, Tooltip } from '@dolanske/vui'

interface Props {
  selectedCount: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  clear: []
}>()
</script>

<template>
  <Transition name="actions">
    <Flex v-if="props.selectedCount" class="selected-rows" y-center x-between>
      <p>
        {{ props.selectedCount }} row{{ props.selectedCount > 1 ? 's' : '' }} selected
      </p>

      <ButtonGroup :gap="2">
        <Dropdown placement="top">
          <template #trigger="{ toggle }">
            <Button size="s" @click="toggle">
              Actions
            </Button>
          </template>
          <slot>
            <p>No actions provided</p>
          </slot>
        </Dropdown>
        <Tooltip>
          <Button size="s" square @click="emit('clear')">
            <Icon name="ph:selection-slash" />
          </Button>
          <template #tooltip>
            <p>Clear selection</p>
          </template>
        </Tooltip>
      </ButtonGroup>
    </Flex>
  </Transition>
</template>

<style scoped lang="scss">
.selected-rows {
  position: fixed;
  bottom: 48px;
  left: 50%;
  min-width: 256px;
  transform: translateX(-50%);
  padding: var(--space-s) var(--space-m);
  border-radius: var(--border-radius-pill);
  border: 1px solid var(--color-border);
  background-color: var(--color-bg-raised);
  box-shadow: var(--box-shadow-strong);

  p {
    font-variant-numeric: tabular-nums;
  }
}

.actions-enter-from,
.actions-leave-to {
  opacity: 0;
  bottom: 32px;
}

.actions-enter-active,
.actions-leave-active {
  transition: var(--transition-slow);
}

.actions-enter-to,
.actions-leave-from {
  opacity: 1;
}
</style>
