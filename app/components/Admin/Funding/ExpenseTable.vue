<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Alert, Badge, Button, defineTable, DropdownItem, Flex, Pagination, Table } from '@dolanske/vui'
import { watch } from 'vue'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import SelectedRowsActions from '@/components/Shared/SelectedRowsActions.vue'

import TableContainer from '@/components/Shared/TableContainer.vue'
import { useAdminCrudTable } from '@/composables/useAdminCrudTable'
import { useBreakpoint } from '@/lib/mediaQuery'
import { formatCurrency } from '@/lib/utils/currency'
import { fullDate } from '@/lib/utils/date'
import { calculateDurationBetweenDates } from '@/lib/utils/duration'
import { getExpenseStatus } from '@/lib/utils/expenses'
import ExpenseDetails from './ExpenseDetails.vue'
import ExpenseFilters from './ExpenseFilters.vue'
import ExpenseForm from './ExpenseForm.vue'

type Expense = Tables<'funding_expenses'>

type ExpenseStatus = 'Planned' | 'Active' | 'Ended'

interface TransformedExpense extends Record<string, unknown> {
  id: number
  Name: string
  Amount: string
  Status: ExpenseStatus
  Started: string
  Duration: string
}

const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

const supabase = useSupabaseClient()
const userId = useUserId()
const isBelowMedium = useBreakpoint('<m')
const showBulkDeleteConfirm = ref(false)

const {
  items: _expenses,
  loading,
  errorMessage,
  filteredRows,
  totalCount,
  filteredCount,
  isFiltered,
  search,
  selectedItem: selectedExpense,
  showDetails: showExpenseDetails,
  showForm: showExpenseForm,
  isEditMode,
  canManageResource,
  canCreate,
  adminTablePerPage,
  viewItem: viewExpenseDetails,
  openAdd: openAddExpenseForm,
  openEdit: openEditExpenseForm,
  handleEditFromDetails,
  refresh: fetchExpenses,
} = useAdminCrudTable<Expense, TransformedExpense>({
  resourceType: 'funding',
  queryParamKey: 'expense',
  refreshSignal,
  fetch: async () => {
    const { data, error } = await supabase
      .from('funding_expenses')
      .select('*')
      .order('started_at', { ascending: false })
    if (error)
      throw error
    return (data as Expense[]) || []
  },
  transform: expense => ({
    id: expense.id,
    Name: expense.name || 'Unnamed Expense',
    Amount: formatCurrency(expense.amount_cents),
    Status: getExpenseStatus(expense.started_at, expense.ended_at),
    Started: fullDate(expense.started_at),
    Duration: calculateDurationBetweenDates(expense.started_at, expense.ended_at),
  }),
  defaultSort: { column: 'Started', direction: 'desc' },
})

const { headers, rows, selectedRows, deselectAllRows, pagination, setPage, setSort, options } = defineTable(filteredRows, {
  pagination: { enabled: true, perPage: adminTablePerPage.value },
  select: true,
})

watch(adminTablePerPage, (perPage) => {
  options.value.pagination.perPage = perPage
  setPage(1)
})

setSort('Started', 'desc')

async function handleExpenseSave(expenseData: Partial<Expense>) {
  try {
    if (isEditMode.value && selectedExpense.value) {
      const { error } = await supabase
        .from('funding_expenses')
        .update({
          ...expenseData,
          modified_at: new Date().toISOString(),
          modified_by: userId.value ?? null,
        })
        .eq('id', selectedExpense.value.id)
      if (error)
        throw error
    }
    else {
      const { error } = await supabase
        .from('funding_expenses')
        .insert({
          ...expenseData,
          created_by: userId.value ?? null,
          modified_by: userId.value ?? null,
          modified_at: new Date().toISOString(),
        })
      if (error)
        throw error
    }

    showExpenseForm.value = false
    await fetchExpenses()
  }
  catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'An error occurred while saving the expense'
  }
}

async function handleExpensesDelete(expenseIds: number[]) {
  if (expenseIds.length === 0)
    return

  try {
    const { error } = await supabase
      .from('funding_expenses')
      .delete()
      .in('id', expenseIds)
    if (error)
      throw error

    showExpenseForm.value = false
    await fetchExpenses()
  }
  catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'An error occurred while deleting the expense'
  }
}

async function handleBulkDelete() {
  showBulkDeleteConfirm.value = false
  const ids = [...selectedRows.value].map(row => row._original.id)
  await handleExpensesDelete(ids)
  deselectAllRows()
}
</script>

<template>
  <!-- Error message -->
  <Alert v-if="errorMessage" variant="danger">
    {{ errorMessage }}
  </Alert>

  <!-- Loading state -->
  <template v-else-if="loading">
    <Flex gap="s" column expand>
      <Flex :column="isBelowMedium" :x-between="!isBelowMedium" :x-start="isBelowMedium" y-center gap="s" expand>
        <Flex gap="s" y-center wrap :expand="isBelowMedium" :x-center="isBelowMedium">
          <ExpenseFilters v-model:search="search" />
        </Flex>

        <Flex
          gap="s"
          :y-center="!isBelowMedium"
          :y-start="isBelowMedium"
          :wrap="isBelowMedium"
          :x-end="!isBelowMedium"
          :x-center="isBelowMedium"
          :x-start="isBelowMedium"
          :expand="isBelowMedium"
          :column-reverse="isBelowMedium"
        >
          <span class="text-color-lighter text-s" :class="{ 'text-center': isBelowMedium }">Total -</span>

          <Button v-if="canCreate" variant="accent" loading :expand="isBelowMedium">
            <template #start>
              <Icon name="ph:plus" />
            </template>
            Add Expense
          </Button>
        </Flex>
      </Flex>

      <TableSkeleton :columns="5" :rows="10" :show-actions="canManageResource" />
    </Flex>
  </template>

  <Flex v-else gap="s" column expand>
    <Flex :column="isBelowMedium" :x-between="!isBelowMedium" :x-start="isBelowMedium" y-center gap="s" expand>
      <Flex gap="s" y-center wrap :expand="isBelowMedium" :x-center="isBelowMedium">
        <ExpenseFilters v-model:search="search" />
      </Flex>

      <Flex
        gap="s"
        :y-center="!isBelowMedium"
        :y-start="isBelowMedium"
        :wrap="isBelowMedium"
        :x-end="!isBelowMedium"
        :x-center="isBelowMedium"
        :x-start="isBelowMedium"
        :expand="isBelowMedium"
        :column-reverse="isBelowMedium"
      >
        <span class="text-color-lighter text-s" :class="{ 'text-center': isBelowMedium }">
          {{ isFiltered ? `Filtered ${filteredCount}` : `Total ${totalCount}` }}
        </span>

        <Button v-if="canCreate" variant="accent" :expand="isBelowMedium" @click="openAddExpenseForm">
          <template #start>
            <Icon name="ph:plus" />
          </template>
          Add Expense
        </Button>
      </Flex>
    </Flex>

    <TableContainer>
      <Table.Root v-if="rows.length > 0" separate-cells :loading="loading" class="mb-l">
        <template #header>
          <th v-if="canManageResource" class="vui-table-interactive-cell" />
          <Table.Head v-for="header in headers.filter(h => h.label !== '_original')" :key="header.label" sort :header />
          <Table.Head
            v-if="canManageResource"
            key="actions"
            :header="{ label: 'Actions',
                       sortToggle: () => {} }"
          />
        </template>

        <template #body>
          <tr v-for="expense in rows" :key="expense._original.id" class="clickable-row">
            <Table.SelectRow v-if="canManageResource" :row="expense" />
            <Table.Cell @click="viewExpenseDetails(expense._original)">
              {{ expense.Name }}
            </Table.Cell>
            <Table.Cell @click="viewExpenseDetails(expense._original)">
              {{ expense.Amount }}
            </Table.Cell>
            <Table.Cell @click="viewExpenseDetails(expense._original)">
              <Badge
                :variant="expense.Status === 'Planned' ? 'accent' : expense.Status === 'Active' ? 'success' : 'neutral'"
              >
                {{ expense.Status }}
              </Badge>
            </Table.Cell>
            <Table.Cell @click="viewExpenseDetails(expense._original)">
              {{ expense.Started }}
            </Table.Cell>
            <Table.Cell @click="viewExpenseDetails(expense._original)">
              {{ expense.Duration }}
            </Table.Cell>
            <Table.Cell v-if="canManageResource" @click.stop>
              <AdminActions
                resource-type="funding"
                :item="expense._original"
                button-size="s"
                @edit="(item) => openEditExpenseForm(item as Expense)"
                @delete="(item) => handleExpensesDelete([(item as Expense).id])"
              />
            </Table.Cell>
          </tr>
        </template>

        <template v-if="filteredRows.length > adminTablePerPage" #pagination>
          <Pagination :pagination="pagination" @change="setPage" />
        </template>
      </Table.Root>

      <Alert v-else-if="!loading" variant="info">
        No expenses found
      </Alert>
    </TableContainer>

    <ExpenseDetails
      v-model:is-open="showExpenseDetails"
      :expense="selectedExpense"
      @edit="handleEditFromDetails"
      @delete="(item) => handleExpensesDelete([item.id])"
    />

    <ExpenseForm
      v-model:is-open="showExpenseForm"
      :expense="selectedExpense"
      :is-edit-mode="isEditMode"
      @save="handleExpenseSave"
      @delete="(id: number) => handleExpensesDelete([id])"
    />

    <SelectedRowsActions
      :selected-count="selectedRows.length"
      @clear="deselectAllRows()"
    >
      <DropdownItem @click="showBulkDeleteConfirm = true">
        <template #icon>
          <Icon name="ph:trash" class="text-color-red" />
        </template>
        Delete
      </DropdownItem>
    </SelectedRowsActions>

    <ConfirmModal
      :open="showBulkDeleteConfirm"
      :title="`Delete ${selectedRows.length} items`"
      :description="`Are you sure you want to delete ${selectedRows.length} expenses? This action cannot be undone.`"
      confirm-text="Delete"
      cancel-text="Cancel"
      :destructive="true"
      @cancel="showBulkDeleteConfirm = false"
      @confirm="handleBulkDelete"
    />
  </Flex>
</template>

<style scoped lang="scss">
.mb-l {
  margin-bottom: var(--space-l);
}
.clickable-row:hover {
  td {
    cursor: pointer;
    background-color: var(--color-bg-raised);
  }
}
td {
  vertical-align: middle;
}
</style>
