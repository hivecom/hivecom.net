<script setup lang="ts">
import type { Ref } from 'vue'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database.overrides'
import { Alert, Badge, Button, defineTable, Flex, paginate, Pagination, Table } from '@dolanske/vui'
import { watchDebounced } from '@vueuse/core'
import { computed, inject, onBeforeMount, ref, watch } from 'vue'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import CalendarButtons from '@/components/Events/CalendarButtons.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { useTableActions } from '@/composables/useTableActions'
import { useBreakpoint } from '@/lib/mediaQuery'
import EventDetails from './EventDetails.vue'
import EventFilters from './EventFilters.vue'
import EventForm from './EventForm.vue'

// ─── RPC return shape ─────────────────────────────────────────────────────────

interface RpcEvent {
  id: number
  title: string
  description: string
  note: string | null
  markdown: string | null
  date: string
  location: string | null
  link: string | null
  duration_minutes: number | null
  games: number[] | null
  google_event_id: string | null
  google_last_synced_at: string | null
  discord_event_id: string | null
  discord_last_synced_at: string | null
  created_at: string
  created_by: string | null
  modified_at: string | null
  modified_by: string | null
  total_count: number
}

// ─── Signals & routing ────────────────────────────────────────────────────────

// Keep declared for v-model binding with parent (EventKPIs coordinates separately via useDataEvents)
const _refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

type Event = Tables<'events'>

const supabase = useSupabaseClient()
const userId = useUserId()
const route = useRoute()
const router = useRouter()

// ─── Permissions ──────────────────────────────────────────────────────────────

const { canManageResource, canCreate } = useTableActions('events')

// ─── Layout ───────────────────────────────────────────────────────────────────

const isBelowMedium = useBreakpoint('<m')

// ─── State ────────────────────────────────────────────────────────────────────

const loading = ref(false)
const initialLoad = ref(true)
const errorMessage = ref('')
const items = ref<RpcEvent[]>([])

const search = ref('')

// ─── Pagination & sort ────────────────────────────────────────────────────────

const page = ref(1)
const adminTablePerPage = inject<Ref<number>>('adminTablePerPage', computed(() => 10))
const totalCount = ref(0)

const sortCol = ref('date')
const sortDir = ref<'asc' | 'desc'>('desc')

const paginationState = computed(() => paginate(totalCount.value, page.value, adminTablePerPage.value))
const shouldShowPagination = computed(() => totalCount.value > adminTablePerPage.value)

// ─── Detail / form state ──────────────────────────────────────────────────────

const selectedEvent = ref<Event | null>(null)
const showEventDetails = ref(false)
const showEventForm = ref(false)
const isEditMode = ref(false)

// ─── Per-row action loading ───────────────────────────────────────────────────

const actionLoadingMap = ref<Record<number, Record<string, boolean>>>({})

function isActionLoading(id: number, action: string): boolean {
  return actionLoadingMap.value[id]?.[action] ?? false
}

function setActionLoading(id: number, action: string, value: boolean): void {
  actionLoadingMap.value[id] ??= {}
  actionLoadingMap.value[id][action] = value
}

// ─── VUI defineTable (for TableSelectionProvideSymbol context) ───────────────

const { rows } = defineTable(items, { pagination: { enabled: false }, select: false })

// ─── Derived counts ───────────────────────────────────────────────────────────

const isFiltered = computed(() => search.value.trim() !== '')

// ─── Sorting ─────────────────────────────────────────────────────────────────

const sortColMap: Record<string, string> = {
  Title: 'title',
  Date: 'date',
}

function handleSort(label: string) {
  const col = sortColMap[label]
  if (!col)
    return
  if (sortCol.value === col) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  }
  else {
    sortCol.value = col
    sortDir.value = 'desc'
  }
  page.value = 1
}

function sortIcon(label: string): string {
  const col = sortColMap[label]
  if (!col || sortCol.value !== col)
    return 'ph:arrows-down-up'
  return sortDir.value === 'asc' ? 'ph:arrow-up' : 'ph:arrow-down'
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchEvents() {
  loading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await supabase.rpc('get_admin_events_paginated', {
      p_search: search.value,
      p_sort_col: sortCol.value,
      p_sort_dir: sortDir.value,
      p_limit: adminTablePerPage.value,
      p_offset: (page.value - 1) * adminTablePerPage.value,
    })

    if (error)
      throw error

    const fetched = (data ?? []) as RpcEvent[]
    items.value = fetched
    totalCount.value = fetched[0]?.total_count ?? 0
  }
  catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to load events'
  }
  finally {
    initialLoad.value = false
    loading.value = false
  }
}

// ─── Pagination handler ───────────────────────────────────────────────────────

function setPage(n: number) {
  page.value = n
}

// ─── Helper functions ─────────────────────────────────────────────────────────

function getEventStatus(event: RpcEvent): { label: string, variant: 'accent' | 'success' | 'neutral' } {
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

// ─── Selection / sheet actions ────────────────────────────────────────────────

function viewEventDetails(event: RpcEvent) {
  selectedEvent.value = event as unknown as Event
  showEventDetails.value = true
}

function openAddEventForm() {
  selectedEvent.value = null
  isEditMode.value = false
  showEventForm.value = true
}

function openEditEventForm(event: RpcEvent) {
  selectedEvent.value = event as unknown as Event
  isEditMode.value = true
  showEventForm.value = true
}

function handleEditFromDetails(event: Event) {
  openEditEventForm(event as unknown as RpcEvent)
  showEventDetails.value = false
}

// ─── Save / delete ────────────────────────────────────────────────────────────

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

    showEventDetails.value = false
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

// ─── URL deep-link ────────────────────────────────────────────────────────────

watch(showEventDetails, (isOpen) => {
  if (isOpen && selectedEvent.value) {
    void router.replace({ query: { ...route.query, event: selectedEvent.value.id } })
    return
  }
  if (isOpen)
    return
  if (route.query.event == null)
    return
  const { event: _event, ...rest } = route.query
  void router.replace({ query: rest })
})

// ─── Watchers ────────────────────────────────────────────────────────────────

watchDebounced(search, () => {
  page.value = 1
  void fetchEvents()
}, { debounce: 300 })

watch([sortCol, sortDir], () => {
  page.value = 1
  void fetchEvents()
})

watch(page, () => {
  void fetchEvents()
})

watch(adminTablePerPage, () => {
  if (page.value !== 1) {
    setPage(1)
    // page watch fires fetch
  }
  else {
    void fetchEvents()
  }
})

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onBeforeMount(async () => {
  await fetchEvents()
  // Honour any ?event= query param present on initial load
  const eventId = route.query.event
  if (!eventId)
    return
  const id = Number.parseInt(String(eventId), 10)
  if (Number.isNaN(id))
    return
  const match = items.value.find(e => e.id === id)
  if (match)
    viewEventDetails(match)
})
</script>

<template>
  <Flex column expand>
    <!-- Error message -->
    <Alert v-if="errorMessage" variant="danger">
      {{ errorMessage }}
    </Alert>

    <!-- Initial skeleton load -->
    <Flex v-else-if="initialLoad" gap="s" column expand>
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
            <Button v-if="canCreate" variant="accent" loading :expand="isBelowMedium">
              <template #start>
                <Icon name="ph:plus" />
              </template>
              Add Event
            </Button>
          </Flex>
        </Flex>
      </Flex>

      <TableSkeleton :columns="4" :rows="10" :show-actions="canManageResource" />
    </Flex>

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
            {{ isFiltered ? `Filtered ${totalCount}` : `Total ${totalCount}` }}
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

      <div class="table-loading-wrapper" :class="{ 'table-loading': loading && !initialLoad }">
        <TableContainer>
          <Table.Root v-if="rows.length > 0" separate-cells class="mb-l">
            <template #header>
              <Table.Head class="sortable-head" @click="handleSort('Title')">
                <Flex gap="xs" y-center>
                  Title
                  <Icon :name="sortIcon('Title')" size="14" class="sort-icon" />
                </Flex>
              </Table.Head>
              <Table.Head class="sortable-head" @click="handleSort('Date')">
                <Flex gap="xs" y-center>
                  Date
                  <Icon :name="sortIcon('Date')" size="14" class="sort-icon" />
                </Flex>
              </Table.Head>
              <Table.Head>Location</Table.Head>
              <Table.Head>Status</Table.Head>
              <Table.Head v-if="canManageResource">
                Actions
              </Table.Head>
            </template>

            <template #body>
              <tr v-for="event in items" :key="event.id" class="clickable-row" @click="viewEventDetails(event)">
                <Table.Cell>{{ event.title }}</Table.Cell>
                <Table.Cell>
                  <TimestampDate :date="event.date" />
                </Table.Cell>
                <Table.Cell>
                  <Badge v-if="event.location" variant="neutral">
                    {{ event.location }}
                  </Badge>
                  <span v-else>-</span>
                </Table.Cell>
                <Table.Cell @click.stop>
                  <Badge :variant="getEventStatus(event).variant">
                    {{ getEventStatus(event).label }}
                  </Badge>
                </Table.Cell>
                <Table.Cell v-if="canManageResource" @click.stop>
                  <AdminActions
                    resource-type="events"
                    :item="event as unknown as Record<string, unknown>"
                    button-size="s"
                    :is-loading="(action: string) => isActionLoading(event.id, action)"
                    @edit="(item) => openEditEventForm(item as unknown as RpcEvent)"
                    @delete="(item) => handleEventDelete((item as unknown as RpcEvent).id)"
                  />
                </Table.Cell>
              </tr>
            </template>

            <template v-if="shouldShowPagination" #pagination>
              <Pagination :pagination="paginationState" @change="setPage" />
            </template>
          </Table.Root>

          <Alert v-else-if="!loading" variant="info">
            No events found
          </Alert>
        </TableContainer>
      </div>

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
  </Flex>
</template>

<style scoped lang="scss">
.mb-l {
  margin-bottom: var(--space-l);
}

.table-loading-wrapper {
  width: 100%;
  overflow: hidden;
  transition: opacity var(--transition-slow);
}

.table-loading {
  opacity: 0.4;
  pointer-events: none;
}

.sortable-head {
  cursor: pointer;
  user-select: none;

  &:hover {
    background-color: var(--color-bg-raised);
  }
}

.sort-icon {
  flex-shrink: 0;
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
