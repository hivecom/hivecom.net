<script setup lang="ts">
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database.overrides'
import { Alert, Badge, Button, defineTable, Flex, Pagination, Table } from '@dolanske/vui'
import { watch } from 'vue'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import CalendarButtons from '@/components/Events/CalendarButtons.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { useAdminCrudTable } from '@/composables/useAdminCrudTable'
import { useBreakpoint } from '@/lib/mediaQuery'
import EventDetails from './EventDetails.vue'
import EventFilters from './EventFilters.vue'
import EventForm from './EventForm.vue'

// Props
const _props = defineProps<{
  canManage?: boolean
}>()

const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

type Event = Tables<'events'>

const supabase = useSupabaseClient()
const userId = useUserId()

const {
  loading,
  errorMessage,
  filteredRows,
  totalCount,
  filteredCount,
  isFiltered,
  search,
  selectedItem: selectedEvent,
  showDetails: showEventDetails,
  showForm: showEventForm,
  isEditMode,
  isActionLoading,
  setActionLoading,
  canManageResource,
  canCreate,
  adminTablePerPage,
  viewItem: viewEventDetails,
  openAdd: openAddEventForm,
  openEdit: openEditEventForm,
  handleEditFromDetails,
  refresh: fetchEvents,
} = useAdminCrudTable<Event, { Title: string | null, Date: string | null, Location: string | null }>({
  resourceType: 'events',
  queryParamKey: 'event',
  refreshSignal,
  fetch: async () => {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('date', { ascending: false })
    if (error)
      throw error
    return (data as Event[]) || []
  },
  transform: event => ({
    Title: event.title,
    Date: event.date,
    Location: event.location,
  }),
  defaultSort: { column: 'Date', direction: 'desc' },
})

const isBelowMedium = useBreakpoint('<m')

const { headers, rows, pagination, setPage, setSort, options } = defineTable(filteredRows, {
  pagination: { enabled: true, perPage: adminTablePerPage.value },
  select: false,
})

watch(adminTablePerPage, (perPage) => {
  options.value.pagination.perPage = perPage
  setPage(1)
})

setSort('Date', 'desc')

function getEventStatus(event: Event): { label: string, variant: 'accent' | 'success' | 'neutral' } {
  const now = new Date()
  const eventStart = new Date(event.date)
  const eventEnd = event.duration_minutes
    ? new Date(eventStart.getTime() + event.duration_minutes * 60 * 1000)
    : eventStart

  if (now < eventStart)
    return { label: 'Upcoming', variant: 'accent' }
  if (now >= eventStart && now <= eventEnd)
    return { label: 'Ongoing', variant: 'success' }
  return { label: 'Past', variant: 'neutral' }
}

async function handleEventSave(eventData: Partial<Event>) {
  try {
    if (isEditMode.value && selectedEvent.value) {
      const updateData: TablesUpdate<'events'> = {
        ...eventData,
        modified_at: new Date().toISOString(),
        modified_by: userId.value ?? null,
      }
      const { error } = await supabase
        .from('events')
        .update(updateData)
        .eq('id', selectedEvent.value.id)
      if (error)
        throw error
    }
    else {
      const createData: TablesInsert<'events'> = {
        ...eventData,
        title: eventData.title || '',
        description: eventData.description || '',
        date: eventData.date || '',
        created_by: userId.value ?? null,
        modified_by: userId.value ?? null,
        modified_at: new Date().toISOString(),
      }
      const { error } = await supabase
        .from('events')
        .insert(createData)
        .select('id')
        .single()
      if (error)
        throw error
    }

    showEventForm.value = false
    await fetchEvents()
  }
  catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'An error occurred while saving the event'
  }
}

async function handleEventDelete(eventId: number) {
  try {
    setActionLoading(eventId, 'delete', true)
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', eventId)
    if (error)
      throw error

    showEventForm.value = false
    await fetchEvents()
  }
  catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'An error occurred while deleting the event'
  }
  finally {
    setActionLoading(eventId, 'delete', false)
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
          <EventFilters v-model:search="search" />
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

          <Flex gap="xs" :wrap="isBelowMedium" :x-center="isBelowMedium" expand>
            <CalendarButtons is-admin />
            <Button v-if="canCreate" variant="accent" loading :expand="isBelowMedium" @click="openAddEventForm">
              <template #start>
                <Icon name="ph:plus" />
              </template>
              Add Event
            </Button>
          </Flex>
        </Flex>
      </Flex>

      <TableSkeleton :columns="3" :rows="10" :show-actions="canManageResource" />
    </Flex>
  </template>

  <Flex v-else gap="s" column expand>
    <Flex :column="isBelowMedium" :x-between="!isBelowMedium" :x-start="isBelowMedium" y-center gap="s" expand>
      <Flex gap="s" y-center wrap :expand="isBelowMedium" :x-center="isBelowMedium">
        <EventFilters v-model:search="search" />
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

        <Flex :gap="isBelowMedium ? 's' : 'xs'" :wrap="isBelowMedium" :x-center="isBelowMedium" :expand="isBelowMedium">
          <CalendarButtons is-admin />
          <Button v-if="canCreate" variant="accent" :expand="isBelowMedium" @click="openAddEventForm">
            <template #start>
              <Icon name="ph:plus" />
            </template>
            Add Event
          </Button>
        </Flex>
      </Flex>
    </Flex>

    <TableContainer>
      <Table.Root v-if="rows.length > 0" separate-cells :loading="loading" class="mb-l">
        <template #header>
          <Table.Head v-for="header in headers.filter(h => h.label !== '_original')" :key="header.label" sort :header />
          <Table.Head
            key="status"
            :header="{ label: 'Status',
                       sortToggle: () => {} }"
          />
          <Table.Head
            v-if="canManageResource"
            key="actions"
            :header="{ label: 'Actions',
                       sortToggle: () => {} }"
          />
        </template>

        <template #body>
          <tr v-for="event in rows" :key="event._original.id" class="clickable-row" @click="viewEventDetails(event._original as Event)">
            <Table.Cell>{{ event.Title }}</Table.Cell>
            <Table.Cell>
              <TimestampDate :date="event.Date" />
            </Table.Cell>
            <Table.Cell>
              <Badge v-if="event.Location" variant="neutral">
                {{ event.Location }}
              </Badge>
              <span v-else>-</span>
            </Table.Cell>
            <Table.Cell @click.stop>
              <Badge :variant="getEventStatus(event._original as Event).variant">
                {{ getEventStatus(event._original as Event).label }}
              </Badge>
            </Table.Cell>
            <Table.Cell v-if="canManageResource" @click.stop>
              <AdminActions
                resource-type="events"
                :item="event._original"
                button-size="s"
                :is-loading="(action: string) => isActionLoading(event._original.id, action)"
                @edit="(item) => openEditEventForm(item as Event)"
                @delete="(item) => handleEventDelete((item as Event).id)"
              />
            </Table.Cell>
          </tr>
        </template>

        <template v-if="filteredRows.length > adminTablePerPage" #pagination>
          <Pagination :pagination="pagination" @change="setPage" />
        </template>
      </Table.Root>

      <Alert v-else-if="!loading" variant="info">
        No events found
      </Alert>
    </TableContainer>

    <EventDetails
      v-model:is-open="showEventDetails"
      :event="selectedEvent"
      @edit="handleEditFromDetails"
      @delete="(item) => handleEventDelete((item as Event).id)"
    />

    <EventForm
      v-model:is-open="showEventForm"
      :event="selectedEvent"
      :is-edit-mode="isEditMode"
      @save="handleEventSave"
      @delete="handleEventDelete"
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
