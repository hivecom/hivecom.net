<script setup lang="ts">
import type { KvEntry } from '@/lib/kvstore'
import { Alert, Badge, Button, defineTable, DropdownItem, Flex, Input, Pagination, Table } from '@dolanske/vui'
import { computed, onBeforeMount, ref } from 'vue'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import SelectedRowsActions from '@/components/Shared/SelectedRowsActions.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import { renderKvValue } from '@/lib/kvstore'
import { useBreakpoint } from '@/lib/mediaQuery'

import KVStoreEditModal from './KVStoreEditModal.vue'

type KvType = KvEntry['type']

const supabase = useSupabaseClient()
const { canManageResource, canCreate } = useTableActions('kvstore')

const loading = ref(true)
const errorMessage = ref('')
const entries = ref<KvEntry[]>([])
const search = ref('')
const isBelowMedium = useBreakpoint('<m')

const showModal = ref(false)
const isEditMode = ref(false)
const selectedEntry = ref<KvEntry | null>(null)
const showBulkDeleteConfirm = ref(false)

const actionLoading = ref<Record<string, boolean>>({})

const filteredEntries = computed<KvEntry[]>(() => {
  if (!search.value.trim())
    return entries.value

  const term = search.value.toLowerCase()
  return entries.value.filter((entry: KvEntry) => {
    const keyMatch = entry.key.toLowerCase().includes(term)
    const valueString = renderKvValue(entry.value).toLowerCase()
    return keyMatch || valueString.includes(term)
  })
})

const totalCount = computed(() => entries.value.length)
const filteredCount = computed(() => filteredEntries.value.length)

const displayRows = computed(() => filteredEntries.value.map((entry: KvEntry) => ({
  id: entry.key,
  Key: entry.key,
  Type: entry.type,
  Value: renderKvValue(entry.value),
  _original: entry,
})))

const { headers, rows, selectedRows, deselectAllRows, pagination, setPage, setSort } = defineTable(displayRows, {
  pagination: {
    enabled: true,
  },
  select: true,
})

const shouldShowPagination = computed(() => {
  const page = pagination.value
  return page.totalItems > page.perPage
})

setSort('Key', 'asc')

async function fetchEntries() {
  loading.value = true
  errorMessage.value = ''
  try {
    const { data, error } = await supabase
      .from('kvstore')
      .select('*')
      .order('key')

    if (error)
      throw error

    entries.value = (data || []) as KvEntry[]
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load KV entries'
  }
  finally {
    loading.value = false
  }
}

function openCreateModal() {
  selectedEntry.value = null
  isEditMode.value = false
  showModal.value = true
}

function openEditModal(entry: KvEntry) {
  selectedEntry.value = entry
  isEditMode.value = true
  showModal.value = true
}

async function handleSave(payload: { key: string, type: KvType, value: unknown }) {
  errorMessage.value = ''
  try {
    actionLoading.value[payload.key] = true
    if (isEditMode.value && selectedEntry.value) {
      const { error } = await supabase
        .from('kvstore')
        .update({
          type: payload.type,
          value: payload.value,
        })
        .eq('key', selectedEntry.value.key)

      if (error)
        throw error
    }
    else {
      const { error } = await supabase
        .from('kvstore')
        .insert({
          key: payload.key,
          type: payload.type,
          value: payload.value,
        })

      if (error)
        throw error
    }

    await fetchEntries()
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to save entry'
  }
  finally {
    actionLoading.value[payload.key] = false
  }
}

async function handleDelete(entryOrEntries: KvEntry | KvEntry[]) {
  errorMessage.value = ''
  const entriesToDelete = Array.isArray(entryOrEntries) ? entryOrEntries : [entryOrEntries]
  const keys = entriesToDelete.map(entry => entry.key)

  if (keys.length === 0)
    return

  try {
    keys.forEach((key) => {
      actionLoading.value[`${key}-delete`] = true
    })

    const { error } = await supabase
      .from('kvstore')
      .delete()
      .in('key', keys)

    if (error)
      throw error

    await fetchEntries()
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to delete entry'
  }
  finally {
    keys.forEach((key) => {
      actionLoading.value[`${key}-delete`] = false
    })
  }
}

async function handleBulkDelete() {
  showBulkDeleteConfirm.value = false

  const selectedEntries = Array.from(selectedRows.value)
    .map(row => row._original as unknown as KvEntry)

  if (selectedEntries.length === 0)
    return

  await handleDelete(selectedEntries)
  deselectAllRows()
}

onBeforeMount(fetchEntries)
</script>

<template>
  <Flex column gap="m" expand>
    <Flex :column="isBelowMedium" :x-between="!isBelowMedium" :x-start="isBelowMedium" y-center gap="s" expand>
      <Flex gap="s" y-center wrap :expand="isBelowMedium" :x-center="isBelowMedium">
        <Input
          v-model="search"
          placeholder="Search key or value"
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
          Add Entry
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
            <Table.Head v-for="header in headers.filter(header => header.label !== '_original' && header.label !== 'id')" :key="header.label" sort :header />
            <Table.Head
              v-if="canManageResource"
              key="actions"
              :header="{ label: 'Actions',
                         sortToggle: () => {} }"
            />
          </template>

          <template #body>
            <tr v-for="row in rows" :key="row._original.key">
              <Table.SelectRow :row="row as any" />
              <Table.Cell>
                <code>{{ row.Key }}</code>
              </Table.Cell>
              <Table.Cell>
                <Badge variant="neutral">
                  {{ row.Type }}
                </Badge>
              </Table.Cell>
              <Table.Cell>
                <Flex gap="xs" y-center>
                  <span class="text-color-light text-s">{{ row.Value }}</span>
                </Flex>
              </Table.Cell>
              <Table.Cell v-if="canManageResource" @click.stop>
                <AdminActions
                  resource-type="kvstore"
                  :item="row._original"
                  button-size="s"
                  :is-loading="(action) => action === 'edit' ? !!actionLoading[row._original.key] : !!actionLoading[`${row._original.key}-delete`]"
                  @edit="(item) => openEditModal(item as unknown as KvEntry)"
                  @delete="(item) => handleDelete(item as unknown as KvEntry)"
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
        No entries found
      </Alert>

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
        :title="`Delete ${selectedRows.length} entries`"
        :description="`Are you sure you want to delete ${selectedRows.length} KV entries? This action cannot be undone.`"
        confirm-text="Delete"
        cancel-text="Cancel"
        :destructive="true"
        @cancel="showBulkDeleteConfirm = false"
        @confirm="handleBulkDelete"
      />
    </template>
  </Flex>

  <KVStoreEditModal
    v-model:open="showModal"
    :entry="selectedEntry"
    :is-edit-mode="isEditMode"
    @save="handleSave"
  />
</template>

<style scoped>
td {
  &:nth-child(4) {
    word-break: break-all;
  }
}
</style>
