<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Alert, Button, defineTable, Flex, Input, Pagination, Table } from '@dolanske/vui'
import { computed } from 'vue'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { useAdminCrudTable } from '@/composables/useAdminCrudTable'
import { useBreakpoint } from '@/lib/mediaQuery'
import MOTDEditModal from './MOTDEditModal.vue'

type Motd = Tables<'motds'>

const supabase = useSupabaseClient()
const userId = useUserId()
const isBelowMedium = useBreakpoint('<m')

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

const { headers, rows, pagination, setPage, setSort } = defineTable(displayRows, {
  pagination: { enabled: true },
  select: false,
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

async function handleDelete(entry: Motd) {
  errorMessage.value = ''

  try {
    setActionLoading(entry.id, 'delete', true)
    const { error } = await supabase
      .from('motds')
      .delete()
      .eq('id', entry.id)

    if (error)
      throw error

    await fetchMotds()
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to delete MOTD'
  }
  finally {
    setActionLoading(entry.id, 'delete', false)
  }
}
</script>

<template>
  <Flex column gap="m" expand>
    <Flex :column="isBelowMedium" :x-between="!isBelowMedium" :x-start="isBelowMedium" y-center gap="s" expand>
      <Flex gap="s" y-center wrap :expand="isBelowMedium" :x-center="isBelowMedium">
        <Input
          v-model="search"
          size="s"
          placeholder="Search messages"
          clearable
          :expand="isBelowMedium"
        />
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
                  @delete="(item) => handleDelete(item as Motd)"
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

  <MOTDEditModal
    v-model:open="showModal"
    :entry="selectedEntry"
    :is-edit-mode="isEditMode"
    @save="handleSave"
  />
</template>
