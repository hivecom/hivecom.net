<script setup lang="ts">
import { Flex, Skeleton, Table } from '@dolanske/vui'
import TableContainer from '@/components/Shared/TableContainer.vue'

interface Props {
  columns?: number

  rows?: number

  showActions?: boolean

  compact?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  columns: 5,
  rows: 10,
  showActions: true,
  compact: false,
})

function getRandomWidth(): number {
  if (props.compact) {
    return Math.floor(Math.random() * 60) + 40
  }
  return Math.floor(Math.random() * 120) + 80
}
</script>

<template>
  <TableContainer>
    <Table.Root separate-cells :class="{ 'table-compact': props.compact }">
      <template #header>
        <Table.Head v-for="i in props.columns" :key="`header-${i}`">
          <Skeleton :width="getRandomWidth()" :height="20" :radius="4" />
        </Table.Head>
        <Table.Head v-if="props.showActions">
          <Skeleton :width="80" :height="20" :radius="4" />
        </Table.Head>
      </template>

      <template #body>
        <tr v-for="row in props.rows" :key="`row-${row}`">
          <Table.Cell v-for="col in props.columns" :key="`cell-${row}-${col}`">
            <Skeleton :width="getRandomWidth()" :height="16" :radius="4" />
          </Table.Cell>
          <Table.Cell v-if="props.showActions">
            <Flex gap="xs" y-center justify="end">
              <Skeleton :width="28" :height="28" :radius="4" />
              <Skeleton :width="28" :height="28" :radius="4" />
              <Skeleton :width="28" :height="28" :radius="4" />
            </Flex>
          </Table.Cell>
        </tr>
      </template>
    </Table.Root>
  </TableContainer>
</template>

<style scoped lang="scss">
/* Compact mode only affects widths and spacing */
:deep(.table-compact td) {
  padding-left: var(--space-xs);
  padding-right: var(--space-xs);
}

:deep(.table-compact th) {
  padding-left: var(--space-s);
  padding-right: var(--space-s);
}

@media (max-width: 1200px) {
  :deep(.table-compact td),
  :deep(.table-compact th) {
    padding-left: var(--space-xs);
    padding-right: var(--space-xs);
  }
}
</style>
