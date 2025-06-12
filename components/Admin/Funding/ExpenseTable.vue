<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Alert, Badge, Button, defineTable, Flex, Pagination, Table } from '@dolanske/vui'
import { computed, onBeforeMount, ref } from 'vue'

import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import TableContainer from '~/components/Shared/TableContainer.vue'
import { formatCurrency } from '~/utils/currency'
import ExpenseDetails from './ExpenseDetails.vue'
import ExpenseFilters from './ExpenseFilters.vue'
import ExpenseForm from './ExpenseForm.vue'

// Expense table type
type Expense = Tables<'expenses'>

// Define transformed expense data interface
interface TransformedExpense {
  Name: string
  Amount: string
  Status: 'Planned' | 'Active' | 'Ended'
  Started: string
  Duration: string
  _original: Expense
}

// Define model value for refresh signal to parent
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

// Get admin permissions
const { canManageResource, canCreate } = useTableActions('expenses')

// Setup client and state
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const loading = ref(true)
const errorMessage = ref('')
const expenses = ref<Expense[]>([])
const search = ref('')

// Expense details state
const showExpenseDetails = ref(false)
const showExpenseForm = ref(false)
const selectedExpense = ref<Expense | null>(null)
const isEditMode = ref(false)

// Format date helper
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// Calculate duration
function calculateDuration(startDate: string, endDate?: string | null): string {
  const start = new Date(startDate)
  const end = endDate ? new Date(endDate) : new Date()

  const diffTime = Math.abs(end.getTime() - start.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays < 30) {
    return `${diffDays} days`
  }
  else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30)
    return `${months} month${months > 1 ? 's' : ''}`
  }
  else {
    const years = Math.floor(diffDays / 365)
    const remainingMonths = Math.floor((diffDays % 365) / 30)
    if (remainingMonths > 0) {
      return `${years}y ${remainingMonths}m`
    }
    return `${years} year${years > 1 ? 's' : ''}`
  }
}

// Check if expense is planned (start date in the future)
function isPlannedExpense(startDate: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(startDate)
  start.setHours(0, 0, 0, 0)
  return start > today
}

// Get expense status
function getExpenseStatus(expense: Expense): 'Planned' | 'Active' | 'Ended' {
  if (isPlannedExpense(expense.started_at)) {
    return 'Planned'
  }
  else if (expense.ended_at) {
    return 'Ended'
  }
  else {
    return 'Active'
  }
}

// Filtered and transformed expenses
const transformedExpenses = computed<TransformedExpense[]>(() => {
  let filteredExpenses = expenses.value

  if (search.value) {
    const searchTerm = search.value.toLowerCase()
    filteredExpenses = expenses.value.filter(expense =>
      expense.name?.toLowerCase().includes(searchTerm)
      || expense.description?.toLowerCase().includes(searchTerm)
      || formatCurrency(expense.amount_cents).toLowerCase().includes(searchTerm),
    )
  }

  return filteredExpenses.map(expense => ({
    Name: expense.name || 'Unnamed Expense',
    Amount: formatCurrency(expense.amount_cents),
    Status: getExpenseStatus(expense),
    Started: formatDate(expense.started_at),
    Duration: calculateDuration(expense.started_at, expense.ended_at),
    _original: expense,
  }))
})

// Table configuration
const { headers, rows, pagination, setPage, setSort } = defineTable(transformedExpenses, {
  pagination: {
    enabled: true,
    perPage: 10,
  },
  select: false,
})

// Set default sorting
setSort('Started', 'desc')

// Fetch expenses data
async function fetchExpenses() {
  loading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .order('started_at', { ascending: false })

    if (error)
      throw error

    expenses.value = data as Expense[] || []
    // Increment the refresh signal to notify the parent
    refreshSignal.value = (refreshSignal.value || 0) + 1
  }
  catch (error: any) {
    errorMessage.value = error.message || 'An error occurred while loading games'
  }
  finally {
    loading.value = false
  }
}

// View expense details
function viewExpenseDetails(expense: Expense) {
  selectedExpense.value = expense
  showExpenseDetails.value = true
}

// Open the add expense form
function openAddExpenseForm() {
  selectedExpense.value = null
  isEditMode.value = false
  showExpenseForm.value = true
}

// Open the edit expense form
function openEditExpenseForm(expense: Expense, event?: Event) {
  // Prevent the click from triggering the view details
  if (event)
    event.stopPropagation()

  selectedExpense.value = expense
  isEditMode.value = true
  showExpenseForm.value = true
}

// Handle edit from ExpenseDetails
function handleEditFromDetails(expense: Expense) {
  openEditExpenseForm(expense)
}

// Handle expense save (both create and update)
async function handleExpenseSave(expenseData: Partial<Expense>) {
  try {
    if (isEditMode.value && selectedExpense.value) {
      // Update existing expense with modification tracking
      const updateData = {
        ...expenseData,
        modified_at: new Date().toISOString(),
        modified_by: user.value?.id,
      }

      const { error } = await supabase
        .from('expenses')
        .update(updateData)
        .eq('id', selectedExpense.value.id)

      if (error)
        throw error
    }
    else {
      // Create new expense with creation and modification tracking
      const createData = {
        ...expenseData,
        created_by: user.value?.id,
        modified_by: user.value?.id,
        modified_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('expenses')
        .insert(createData)

      if (error)
        throw error
    }

    // Refresh expenses data and close form
    showExpenseForm.value = false
    await fetchExpenses()
  }
  catch (error: any) {
    errorMessage.value = error.message || 'An error occurred while saving the expense'
  }
}

// Handle expense deletion
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
  catch (error: any) {
    errorMessage.value = error.message || 'An error occurred while deleting the expense'
  }
}

// Lifecycle hooks
onBeforeMount(fetchExpenses)
</script>

<template>
  <!-- Error message -->
  <Alert v-if="errorMessage" variant="danger">
    {{ errorMessage }}
  </Alert>

  <!-- Loading state -->
  <template v-else-if="loading">
    <Flex gap="s" column expand>
      <!-- Header and filters -->
      <Flex x-between expand>
        <ExpenseFilters v-model:search="search" />

        <Button v-if="canCreate" variant="accent" @click="openAddExpenseForm">
          <template #start>
            <Icon name="ph:plus" />
          </template>
          Add Expense
        </Button>
      </Flex>

      <!-- Table skeleton -->
      <TableSkeleton
        :columns="5"
        :rows="10"
        :show-actions="canManageResource"
      />
    </Flex>
  </template>

  <Flex v-else gap="s" column expand>
    <!-- Header and filters -->
    <Flex x-between expand>
      <ExpenseFilters v-model:search="search" />

      <Button v-if="canCreate" variant="accent" @click="openAddExpenseForm">
        <template #start>
          <Icon name="ph:plus" />
        </template>
        Add Expense
      </Button>
    </Flex>

    <!-- Table -->
    <TableContainer>
      <Table.Root v-if="rows.length > 0" separate-cells :loading="loading" class="mb-l">
        <template #header>
          <Table.Head v-for="header in headers.filter(header => header.label !== '_original')" :key="header.label" sort :header />
          <Table.Head
            v-if="canManageResource"
            key="actions" :header="{ label: 'Actions',
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
                @edit="(expenseItem) => openEditExpenseForm(expenseItem)"
                @delete="(expenseItem) => handleExpenseDelete(expenseItem.id)"
              />
            </Table.Cell>
          </tr>
        </template>

        <template v-if="transformedExpenses.length > 10" #pagination>
          <Pagination :pagination="pagination" @change="setPage" />
        </template>
      </Table.Root>

      <!-- No results message -->
      <Alert v-else-if="!loading" variant="info">
        No expenses found
      </Alert>
    </TableContainer>

    <!-- Expense Detail Sheet -->
    <ExpenseDetails
      v-model:is-open="showExpenseDetails"
      :expense="selectedExpense"
      @edit="handleEditFromDetails"
    />

    <!-- Expense Form Sheet (for both create and edit) -->
    <ExpenseForm
      v-model:is-open="showExpenseForm"
      :expense="selectedExpense"
      :is-edit-mode="isEditMode"
      @save="handleExpenseSave"
      @delete="handleExpenseDelete"
    />
  </Flex>
</template>

<style scoped>
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
