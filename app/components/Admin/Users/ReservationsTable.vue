<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Alert, Button, defineTable, Flex, Input, Pagination, Table, Tooltip } from '@dolanske/vui'
import { watch } from 'vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import UserLink from '@/components/Shared/UserLink.vue'
import { useAdminCrudTable } from '@/composables/useAdminCrudTable'
import { useBreakpoint } from '@/lib/mediaQuery'
import { fullDate } from '@/lib/utils/date'
import ReservationForm from './ReservationForm.vue'

type Reservation = Tables<'profile_reservations'>

interface ReservationRow extends Reservation {
  assigned: { id: string, username: string } | null
}

interface TransformedReservation extends Record<string, unknown> {
  id: number
  Username: string
  Note: string
  Assigned: string
  Created: string
}

const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

const supabase = useSupabaseClient()
const userId = useUserId()
const isBelowMedium = useBreakpoint('<m')

const showDeleteConfirm = ref(false)
const reservationToDelete = ref<ReservationRow | null>(null)

const {
  loading,
  errorMessage,
  filteredRows,
  totalCount,
  filteredCount,
  isFiltered,
  search,
  selectedItem,
  showForm,
  isEditMode,
  canManageResource,
  canCreate,
  canUpdate,
  canDelete,
  adminTablePerPage,
  openAdd,
  openEdit,
  refresh,
} = useAdminCrudTable<ReservationRow, TransformedReservation>({
  resourceType: 'users',
  queryParamKey: false,
  refreshSignal,
  fetch: async () => {
    const { data, error } = await supabase
      .from('profile_reservations')
      .select('*, assigned:assigned_to(id, username)')
      .order('created_at', { ascending: false })
    if (error)
      throw error
    return (data as ReservationRow[]) || []
  },
  transform: reservation => ({
    id: reservation.id,
    Username: reservation.username,
    Note: reservation.note || '-',
    Assigned: reservation.assigned?.username ?? '-',
    Created: fullDate(reservation.created_at),
  }),
  defaultSort: { column: 'Created', direction: 'desc' },
})

const { headers, rows, pagination, setPage, setSort, options } = defineTable(filteredRows, {
  pagination: { enabled: true, perPage: adminTablePerPage.value },
})

watch(adminTablePerPage, (perPage) => {
  options.value.pagination.perPage = perPage
  setPage(1)
})

setSort('Created', 'desc')

async function handleReservationSave(data: { username: string, note: string | null, assigned_to: string | null }) {
  try {
    if (isEditMode.value && selectedItem.value) {
      const { error } = await supabase
        .from('profile_reservations')
        .update({
          username: data.username,
          note: data.note,
          assigned_to: data.assigned_to,
        })
        .eq('id', selectedItem.value.id)
      if (error)
        throw error
    }
    else {
      const { error } = await supabase
        .from('profile_reservations')
        .insert({
          username: data.username,
          note: data.note,
          assigned_to: data.assigned_to,
          created_by: userId.value ?? null,
        })
      if (error)
        throw error
    }

    showForm.value = false
    await refresh()
  }
  catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      errorMessage.value = 'This username is already reserved.'
      return
    }
    errorMessage.value = err instanceof Error ? err.message : 'An error occurred while saving the reservation'
  }
}

async function handleReservationDelete(id: number) {
  try {
    const { error } = await supabase
      .from('profile_reservations')
      .delete()
      .eq('id', id)
    if (error)
      throw error

    showForm.value = false
    await refresh()
  }
  catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'An error occurred while deleting the reservation'
  }
}

function openDeleteConfirm(reservation: ReservationRow) {
  reservationToDelete.value = reservation
  showDeleteConfirm.value = true
}

async function confirmDelete() {
  if (!reservationToDelete.value)
    return
  const id = reservationToDelete.value.id
  reservationToDelete.value = null
  await handleReservationDelete(id)
}
</script>

<template>
  <Alert v-if="errorMessage" variant="danger">
    {{ errorMessage }}
  </Alert>

  <template v-else-if="loading">
    <Flex gap="s" column expand>
      <Flex :column="isBelowMedium" :x-between="!isBelowMedium" :x-start="isBelowMedium" y-center gap="s" expand>
        <Flex gap="s" y-center wrap :expand="isBelowMedium" :x-center="isBelowMedium">
          <Input v-model="search" placeholder="Search reservations..." expand>
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
          <span class="text-color-lighter text-s" :class="{ 'text-center': isBelowMedium }">Total -</span>

          <Button v-if="canCreate" variant="accent" loading :expand="isBelowMedium">
            <template #start>
              <Icon name="ph:plus" />
            </template>
            Add Reservation
          </Button>
        </Flex>
      </Flex>

      <TableSkeleton :columns="5" :rows="10" :show-actions="canManageResource" />
    </Flex>
  </template>

  <Flex v-else gap="s" column expand>
    <Flex :column="isBelowMedium" :x-between="!isBelowMedium" :x-start="isBelowMedium" y-center gap="s" expand>
      <Flex gap="s" y-center wrap :expand="isBelowMedium" :x-center="isBelowMedium">
        <Input v-model="search" placeholder="Search reservations..." expand>
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
          {{ isFiltered ? `Filtered ${filteredCount}` : `Total ${totalCount}` }}
        </span>

        <Button v-if="canCreate" variant="accent" :expand="isBelowMedium" @click="openAdd">
          <template #start>
            <Icon name="ph:plus" />
          </template>
          Add Reservation
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
          <tr v-for="reservation in rows" :key="reservation._original.id">
            <Table.Cell>{{ reservation.id }}</Table.Cell>
            <Table.Cell>{{ reservation.Username }}</Table.Cell>
            <Table.Cell>{{ reservation.Note }}</Table.Cell>
            <Table.Cell>
              <UserLink
                v-if="reservation._original.assigned"
                :user-id="reservation._original.assigned.id"
                show-avatar
                class="text-s"
              />
              <span v-else class="text-color-light text-s">-</span>
            </Table.Cell>
            <Table.Cell>{{ reservation.Created }}</Table.Cell>
            <Table.Cell v-if="canManageResource">
              <Flex gap="xs">
                <Tooltip v-if="canUpdate">
                  <Button size="s" variant="gray" square @click="openEdit(reservation._original)">
                    <Icon name="ph:pencil-simple" />
                  </Button>
                  <template #tooltip>
                    <p>Edit reservation</p>
                  </template>
                </Tooltip>
                <Tooltip v-if="canDelete">
                  <Button size="s" variant="danger" square @click="openDeleteConfirm(reservation._original)">
                    <Icon name="ph:trash" />
                  </Button>
                  <template #tooltip>
                    <p>Delete reservation</p>
                  </template>
                </Tooltip>
              </Flex>
            </Table.Cell>
          </tr>
        </template>

        <template v-if="filteredRows.length > adminTablePerPage" #pagination>
          <Pagination :pagination="pagination" @change="setPage" />
        </template>
      </Table.Root>

      <Alert v-else-if="!loading" variant="info">
        No reservations found
      </Alert>
    </TableContainer>

    <ReservationForm
      v-model:is-open="showForm"
      :reservation="selectedItem"
      :is-edit-mode="isEditMode"
      @save="handleReservationSave"
      @delete="handleReservationDelete"
    />

    <ConfirmModal
      v-model:open="showDeleteConfirm"
      :confirm="confirmDelete"
      title="Confirm Delete Reservation"
      :description="`Are you sure you want to delete the reservation for '${reservationToDelete?.username}'? This action cannot be undone.`"
      confirm-text="Delete"
      cancel-text="Cancel"
      :destructive="true"
    />
  </Flex>
</template>

<style scoped lang="scss">
.mb-l {
  margin-bottom: var(--space-l);
}
td {
  vertical-align: middle;
}
</style>
