<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Alert, Button, defineTable, Flex, Input, Pagination, Table } from '@dolanske/vui'
import { computed, onBeforeMount, ref } from 'vue'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { useBreakpoint } from '@/lib/mediaQuery'
import MOTDEditModal from './MOTDEditModal.vue'

const supabase = useSupabaseClient()
const userId = useUserId()
const { canManageResource, canCreate } = useTableActions('motds')

const loading = ref(true)
const errorMessage = ref('')
const motds = ref<Tables<'motds'>[]>([])
const search = ref('')
const isBelowMedium = useBreakpoint('<m')

const showModal = ref(false)
const isEditMode = ref(false)
const selectedEntry = ref<Tables<'motds'> | null>(null)

const actionLoading = ref<Record<string, boolean>>({})

const filteredMotds = computed(() => {
  if (!search.value.trim())
    return motds.value

  const term = search.value.toLowerCase()
  return motds.value.filter(entry => entry.message.toLowerCase().includes(term))
})

const totalCount = computed(() => motds.value.length)
const filteredCount = computed(() => filteredMotds.value.length)

const displayRows = computed(() => filteredMotds.value.map(entry => ({
  Message: entry.message,
  Created: entry.created_at,
  Modified: entry.modified_at,
  _original: entry,
})))

const { headers, rows, pagination, setPage, setSort } = defineTable(displayRows, {
  pagination: {
    enabled: true,
  },
  select: false,
})

const shouldShowPagination = computed(() => {
  const page = pagination.value
  return page.totalItems > page.perPage
})

setSort('Created', 'desc')

async function fetchMotds() {
  loading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await supabase
      .from('motds')
      .select('*')
      .order('created_at', { ascending: false })

    if (error)
      throw error

    motds.value = data || []
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load MOTDs'
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

function openEditModal(entry: Tables<'motds'>) {
  selectedEntry.value = entry
  isEditMode.value = true
  showModal.value = true
}

async function handleSave(payload: { id?: number, message: string }) {
  errorMessage.value = ''
  const now = new Date().toISOString()

  try {
    if (payload.id) {
      actionLoading.value[String(payload.id)] = true
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
      actionLoading.value[String(payload.id)] = false
  }
}

async function handleDelete(entry: Tables<'motds'>) {
  errorMessage.value = ''

  try {
    actionLoading.value[`${entry.id}-delete`] = true
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
    actionLoading.value[`${entry.id}-delete`] = false
  }
}

onBeforeMount(fetchMotds)
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
            <Table.Head v-for="header in headers.filter(header => header.label !== '_original')" :key="header.label" sort :header />
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
                <span v-else class="text-color-light">—</span>
              </Table.Cell>
              <Table.Cell v-if="canManageResource" @click.stop>
                <AdminActions
                  resource-type="motds"
                  :item="row._original"
                  :is-loading="(action) => action === 'edit' ? !!actionLoading[String(row._original.id)] : !!actionLoading[`${row._original.id}-delete`]"
                  @edit="(item) => openEditModal(item as Tables<'motds'>)"
                  @delete="(item) => handleDelete(item as Tables<'motds'>)"
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
