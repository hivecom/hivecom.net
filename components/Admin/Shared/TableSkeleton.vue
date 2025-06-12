<script setup lang="ts">
import { Flex, Skeleton, Table } from '@dolanske/vui'
import TableContainer from '@/components/Shared/TableContainer.vue'

interface Props {
  // Number of header columns to show skeletons for
  columns?: number
  // Number of rows to show skeletons for
  rows?: number
  // Whether to show an actions column
  showActions?: boolean
  // Whether to use compact column widths for tables with many columns
  compact?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  columns: 5,
  rows: 10,
  showActions: true,
  compact: false,
})

// Generate random widths for more realistic skeleton appearance
function getRandomWidth(): number {
  if (props.compact) {
    return Math.floor(Math.random() * 60) + 40 // Between 40-100px for compact mode
  }
  return Math.floor(Math.random() * 120) + 80 // Between 80-200px for normal mode
}
</script>

<template>
  <TableContainer>
    <Table.Root separate-cells :class="{ 'table-compact': props.compact }">
      <!-- Header Skeleton -->
      <template #header>
        <Table.Head v-for="i in props.columns" :key="`header-${i}`">
          <Skeleton :width="getRandomWidth()" :height="20" :radius="4" />
        </Table.Head>
        <Table.Head v-if="props.showActions">
          <Skeleton :width="80" :height="20" :radius="4" />
        </Table.Head>
      </template>

      <!-- Body Skeleton -->
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

<style scoped>
/* Compact mode for tables with many columns - only affects widths/spacing */
:deep(.table-compact td) {
  padding-left: var(--space-xs);
  padding-right: var(--space-xs);
}

:deep(.table-compact th) {
  padding-left: var(--space-s);
  padding-right: var(--space-s);
}

/* Additional responsive adjustments for compact mode */
@media (max-width: 1200px) {
  :deep(.table-compact td),
  :deep(.table-compact th) {
    padding-left: var(--space-xs);
    padding-right: var(--space-xs);
  }
}
</style>
