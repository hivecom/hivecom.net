<script setup lang="ts">
import type { Ref } from 'vue'
import type { Tables } from '@/types/database.overrides'
import { Alert, Button, defineTable, DropdownItem, Flex, Input, Pagination, Table } from '@dolanske/vui'
import { computed, inject, ref, watch } from 'vue'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import SelectedRowsActions from '@/components/Shared/SelectedRowsActions.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'

import { useAdminCrudTable } from '@/composables/useAdminCrudTable'
import { useBreakpoint } from '@/lib/mediaQuery'
import MOTDEditModal from './MOTDEditModal.vue'

type Motd = Tables<'motds'>

const supabase = useSupabaseClient()
const userId = useUserId()
const isBelowMedium = useBreakpoint('<m')
const adminTablePerPage = inject<Ref<number>>('adminTablePerPage', computed(() => 10))

const {
  items: _motds,
  loading,
  errorMessage,
  filteredRows,
  totalCount,
  filteredCount,
  search,
  selectedItem: selectedEntry,
  showForm: showModal,
  isEditMode,
  canManageResource,
  canCreate,
  isActionLoading,
  setActionLoading,
  openAdd: openCreateModal,
  openEdit: openEditModal,
  refresh: fetchMotds,
} = useAdminCrudTable<Motd, { Message: string, Created: string | null, Modified: string | null }>({
  resourceType: 'motds',
  queryParamKey: false,
  fetch: async () => {
    const { data, error } = await supabase
      .from('motds')
      .select('*')
      .order('created_at', { ascending: false })

    if (error)
      throw error

    return data ?? []
  },
  transform: item => ({
    Message: item.message,
    Created: item.created_at,
    Modified: item.modified_at,
  }),
  defaultSort: { column: 'Created', direction: 'desc' },
})

const displayRows = computed(() => filteredRows.value)

const { headers, rows, pagination, setPage, setSort, selectedRows, deselectAllRows, options } = defineTable(displayRows, {
  pagination: { enabled: true, perPage: adminTablePerPage.value },
  select: true,
})

watch(adminTablePerPage, (perPage) => {
  options.value.pagination.perPage = perPage
  setPage(1)
})

const shouldShowPagination = computed(() => {
  const page = pagination.value
  return page.totalItems > page.perPage
})

setSort('Created', 'desc')

async function handleSave(payload: { id?: number, message: string }) {
  errorMessage.value = ''
  const now = new Date().toISOString()

  try {
    if (payload.id) {
      setActionLoading(payload.id, 'edit', true)
      const { error } = await supabase
        .from('motds')
        .update({
          message: payload.message,
          modified_at: now,
          modified_by: userId.value ?? null,
        })
        .eq('id', payload.id)

      if (error)
        throw error
    }
    else {
      const { error } = await supabase
        .from('motds')
        .insert({
          message: payload.message,
          created_by: userId.value ?? null,
          modified_by: userId.value ?? null,
          modified_at: now,
        })

      if (error)
        throw error
    }

    showModal.value = false
    await fetchMotds()
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to save MOTD'
  }
  finally {
    if (payload.id)
      setActionLoading(payload.id, 'edit', false)
  }
}

async function handleDelete(ids: number[]) {
  errorMessage.value = ''

  try {
    for (const id of ids)
      setActionLoading(id, 'delete', true)

    const { error } = await supabase
      .from('motds')
      .delete()
      .in('id', ids)

    if (error)
      throw error

    await fetchMotds()
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to delete MOTD'
  }
  finally {
    for (const id of ids)
      setActionLoading(id, 'delete', false)
  }
}

// Bulk deletion
const showBulkDeleteConfirm = ref(false)

async function handleBulkDelete() {
  showBulkDeleteConfirm.value = false
  const ids = [...selectedRows.value].map(row => row._original.id)
  await handleDelete(ids)
  deselectAllRows()
}
</script>

<template>
  <Flex column gap="m" expand>
    <Flex :column="isBelowMedium" :x-between="!isBelowMedium" :x-start="isBelowMedium" y-center gap="s" expand>
      <Flex gap="s" y-center wrap :expand="isBelowMedium" :x-center="isBelowMedium">
        <Input
          v-model="search"
          placeholder="Search messages"
          clearable
          :expand="isBelowMedium"
        >
          <template #start>
            <Icon name="ph:magnifying-glass" />
          </template>
        </Input>
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
          {{ search.trim() ? `Filtered ${filteredCount}` : `Total ${totalCount}` }}
        </span>

        <Button v-if="canCreate" variant="accent" :expand="isBelowMedium" @click="openCreateModal">
          <template #start>
            <Icon name="ph:plus" />
          </template>
          Add MOTD
        </Button>
      </Flex>
    </Flex>

    <Alert v-if="errorMessage" variant="danger">
      {{ errorMessage }}
    </Alert>

    <template v-else-if="loading">
      <TableSkeleton :columns="canManageResource ? 4 : 3" :rows="6" :show-actions="canManageResource" />
    </template>

    <template v-else>
      <TableContainer>
        <Table.Root :loading="loading" separate-cells>
          <template #header>
            <th class="vui-table-interactive-cell" />
            <Table.Head v-for="header in headers.filter(h => h.label !== '_original')" :key="header.label" sort :header />
            <Table.Head
              v-if="canManageResource"
              key="actions"
              :header="{ label: 'Actions',
                         sortToggle: () => {} }"
            />
          </template>

          <template #body>
            <tr v-for="row in rows" :key="row._original.id">
              <Table.SelectRow :row="row as any" />
              <Table.Cell>
                {{ row.Message }}
              </Table.Cell>
              <Table.Cell>
                <TimestampDate :date="row.Created" />
              </Table.Cell>
              <Table.Cell>
                <TimestampDate v-if="row.Modified" :date="row.Modified" />
                <span v-else class="text-color-light">-</span>
              </Table.Cell>
              <Table.Cell v-if="canManageResource" @click.stop>
                <AdminActions
                  resource-type="motds"
                  :item="row._original"
                  button-size="s"
                  :is-loading="(action) => isActionLoading(row._original.id, action)"
                  @edit="(item) => openEditModal(item as Motd)"
                  @delete="(item) => handleDelete([(item as Motd).id])"
                />
              </Table.Cell>
            </tr>
          </template>

          <template v-if="shouldShowPagination" #pagination>
            <Pagination :pagination="pagination" @change="setPage" />
          </template>
        </Table.Root>
      </TableContainer>

      <Alert v-if="!loading && rows.length === 0" variant="info">
        No messages found
      </Alert>
    </template>
  </Flex>

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

  <MOTDEditModal
    v-model:open="showModal"
    :entry="selectedEntry"
    :is-edit-mode="isEditMode"
    @save="handleSave"
  />

  <!-- Bulk Delete Confirmation Modal -->
  <ConfirmModal
    :open="showBulkDeleteConfirm"
    :title="`Delete ${selectedRows.length} items`"
    :description="`Are you sure you want to delete ${selectedRows.length} MOTD items? This action cannot be undone.`"
    confirm-text="Delete"
    cancel-text="Cancel"
    :destructive="true"
    @cancel="showBulkDeleteConfirm = false"
    @confirm="handleBulkDelete"
  />
</template>
