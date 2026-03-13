<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Alert, Badge, Button, defineTable, Flex, Pagination, Table } from '@dolanske/vui'
import { watch } from 'vue'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import { useAdminCrudTable } from '@/composables/useAdminCrudTable'
import { useBreakpoint } from '@/lib/mediaQuery'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDateShort } from '@/lib/utils/date'
import { calculateDurationBetweenDates } from '@/lib/utils/duration'
import { getExpenseStatus } from '@/lib/utils/expenses'
import ExpenseDetails from './ExpenseDetails.vue'
import ExpenseFilters from './ExpenseFilters.vue'
import ExpenseForm from './ExpenseForm.vue'

type Expense = Tables<'expenses'>

type ExpenseStatus = 'Planned' | 'Active' | 'Ended'

interface TransformedExpense extends Record<string, unknown> {
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
  resourceType: 'expenses',
  queryParamKey: 'expense',
  refreshSignal,
  fetch: async () => {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .order('started_at', { ascending: false })
    if (error)
      throw error
    return (data as Expense[]) || []
  },
  transform: expense => ({
    Name: expense.name || 'Unnamed Expense',
    Amount: formatCurrency(expense.amount_cents),
    Status: getExpenseStatus(expense.started_at, expense.ended_at),
    Started: formatDateShort(expense.started_at),
    Duration: calculateDurationBetweenDates(expense.started_at, expense.ended_at),
  }),
  defaultSort: { column: 'Started', direction: 'desc' },
})

const { headers, rows, pagination, setPage, setSort, options } = defineTable(filteredRows, {
  pagination: { enabled: true, perPage: adminTablePerPage.value },
  select: false,
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
        .from('expenses')
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
        .from('expenses')
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

async function handleExpenseDelete(expenseId: number) {
  try {
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', expenseId)
    if (error)
      throw error

    showExpenseForm.value = false
    await fetchExpenses()
  }
  catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'An error occurred while deleting the expense'
  }
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
          <Table.Head v-for="header in headers.filter(h => h.label !== '_original')" :key="header.label" sort :header />
          <Table.Head
            v-if="canManageResource"
            key="actions"
            :header="{ label: 'Actions',
                       sortToggle: () => {} }"
          />
        </template>

        <template #body>
          <tr v-for="expense in rows" :key="expense._original.id" class="clickable-row" @click="viewExpenseDetails(expense._original)">
            <Table.Cell>{{ expense.Name }}</Table.Cell>
            <Table.Cell>{{ expense.Amount }}</Table.Cell>
            <Table.Cell>
              <Badge
                :variant="expense.Status === 'Planned' ? 'accent' : expense.Status === 'Active' ? 'success' : 'neutral'"
              >
                {{ expense.Status }}
              </Badge>
            </Table.Cell>
            <Table.Cell>{{ expense.Started }}</Table.Cell>
            <Table.Cell>{{ expense.Duration }}</Table.Cell>
            <Table.Cell v-if="canManageResource" @click.stop>
              <AdminActions
                resource-type="expenses"
                :item="expense._original"
                button-size="s"
                @edit="(item) => openEditExpenseForm(item as Expense)"
                @delete="(item) => handleExpenseDelete((item as Expense).id)"
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
      @delete="(item) => handleExpenseDelete(item.id)"
    />

    <ExpenseForm
      v-model:is-open="showExpenseForm"
      :expense="selectedExpense"
      :is-edit-mode="isEditMode"
      @save="handleExpenseSave"
      @delete="handleExpenseDelete"
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
