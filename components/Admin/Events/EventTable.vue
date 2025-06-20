<script setup lang="ts">
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database.types'
import { Alert, Badge, Button, defineTable, Flex, Pagination, Table } from '@dolanske/vui'
import { computed, onBeforeMount, ref } from 'vue'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import CalendarButtons from '@/components/Events/CalendarButtons.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import EventDetails from './EventDetails.vue'
import EventFilters from './EventFilters.vue'
import EventForm from './EventForm.vue'

// Event table type
type Event = Tables<'events'>

// Props
const _props = defineProps<{
  canManage?: boolean
}>()

// Define model value for refresh signal to parent
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

// Get admin permissions
const { canManageResource, canCreate } = useTableActions('events')

// Setup client and state
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const loading = ref(true)
const errorMessage = ref('')
const events = ref<Event[]>([])
const search = ref('')

// Event details state
const showEventDetails = ref(false)
const showEventForm = ref(false)
const selectedEvent = ref<Event | null>(null)
const isEditMode = ref(false)

// Loading states for individual events
const eventLoadingStates = ref<Record<number, Record<string, boolean>>>({})

// Helper function to check if an action is loading for a specific event
function isEventActionLoading(eventId: number, action: string): boolean {
  return eventLoadingStates.value[eventId]?.[action] || false
}

// Helper function to set loading state for an event action
function setEventActionLoading(eventId: number, action: string, loading: boolean) {
  if (!eventLoadingStates.value[eventId]) {
    eventLoadingStates.value[eventId] = {}
  }
  eventLoadingStates.value[eventId][action] = loading
}

// Filtered and transformed events
const transformedEvents = computed(() => {
  if (!search.value) {
    return events.value.map(event => ({
      Title: event.title,
      Date: event.date,
      Location: event.location,
      _original: event,
    }))
  }

  const searchTerm = search.value.toLowerCase()
  return events.value.filter(event =>
    event.title?.toLowerCase().includes(searchTerm)
    || event.description?.toLowerCase().includes(searchTerm)
    || event.location?.toLowerCase().includes(searchTerm)
    || event.note?.toLowerCase().includes(searchTerm),
  ).map(event => ({
    Title: event.title,
    Date: event.date,
    Location: event.location,
    Description: event.description,
    _original: event,
  }))
})

// Table configuration
const { headers, rows, pagination, setPage, setSort } = defineTable(transformedEvents, {
  pagination: {
    enabled: true,
    perPage: 10,
  },
  select: false,
})

// Set default sorting by date (newest first)
setSort('Date', 'desc')

// Google Calendar sync function
async function syncEventWithGoogleCalendar(action: 'INSERT' | 'UPDATE' | 'DELETE', eventId: number) {
  try {
    const { data, error } = await supabase.functions.invoke('admin-google-calendar-sync', {
      method: 'POST',
      body: {
        eventId,
        action,
      },
    })

    if (error) {
      console.error('Google Calendar sync error:', error)
      throw error
    }

    return data
  }
  catch (error) {
    console.error('Failed to sync with Google Calendar:', error)
    // Don't throw the error - we don't want sync failures to break the UI
    // The user should still see their event created/updated even if sync fails
  }
}

// Fetch events data
async function fetchEvents() {
  loading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('date', { ascending: false })

    if (error)
      throw error

    events.value = data as Event[] || []
    // Increment the refresh signal to notify the parent
    refreshSignal.value = (refreshSignal.value || 0) + 1
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'An error occurred while loading events'
  }
  finally {
    loading.value = false
  }
}

// View event details
function viewEventDetails(event: Event) {
  selectedEvent.value = event
  showEventDetails.value = true
}

// Open the add event form
function openAddEventForm() {
  selectedEvent.value = null
  isEditMode.value = false
  showEventForm.value = true
}

// Open the edit event form
function openEditEventForm(event: Event, clickEvent?: MouseEvent) {
  // Prevent the click from triggering the view details
  if (clickEvent)
    clickEvent.stopPropagation()

  selectedEvent.value = event
  isEditMode.value = true
  showEventForm.value = true
}

// Handle edit from EventDetails
function handleEditFromDetails(event: Event) {
  openEditEventForm(event)
}

async function handleEventSave(eventData: Partial<Event>) {
  try {
    let eventId: number | undefined

    if (isEditMode.value && selectedEvent.value) {
      // Update existing event with modification tracking
      const updateData: TablesUpdate<'events'> = {
        ...eventData,
        modified_at: new Date().toISOString(),
        modified_by: user.value?.id || null,
      }

      const { error } = await supabase
        .from('events')
        .update(updateData)
        .eq('id', selectedEvent.value.id)

      if (error)
        throw error

      eventId = selectedEvent.value.id
    }
    else {
      // Create new event with creation and modification tracking
      const createData: TablesInsert<'events'> = {
        ...eventData,
        title: eventData.title || '',
        description: eventData.description || '',
        date: eventData.date || '',
        created_by: user.value?.id || null,
        modified_by: user.value?.id || null,
        modified_at: new Date().toISOString(),
      }

      const { data, error } = await supabase
        .from('events')
        .insert(createData)
        .select('id')
        .single()

      if (error)
        throw error

      eventId = data?.id
    }

    // Sync with Google Calendar if we have an event ID
    if (eventId) {
      await syncEventWithGoogleCalendar(
        isEditMode.value ? 'UPDATE' : 'INSERT',
        eventId,
      )
    }

    // Refresh events data and close form
    showEventForm.value = false
    await fetchEvents()
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'An error occurred while saving the event'
  }
}

// Handle event deletion
async function handleEventDelete(eventId: number) {
  try {
    // Set loading state
    setEventActionLoading(eventId, 'delete', true)

    // Sync with Google Calendar first (before deleting from our database)
    await syncEventWithGoogleCalendar('DELETE', eventId)

    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', eventId)

    if (error)
      throw error

    showEventForm.value = false
    await fetchEvents()
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'An error occurred while deleting the event'
  }
  finally {
    // Clear loading state (though component will reload anyway)
    setEventActionLoading(eventId, 'delete', false)
  }
}

// Helper function to get event status
function getEventStatus(event: Event): { label: string, variant: 'accent' | 'success' | 'neutral' } {
  const now = new Date()
  const eventStart = new Date(event.date)
  const eventEnd = event.duration_minutes
    ? new Date(eventStart.getTime() + event.duration_minutes * 60 * 1000)
    : eventStart

  if (now < eventStart) {
    return { label: 'Upcoming', variant: 'accent' }
  }
  else if (now >= eventStart && now <= eventEnd) {
    return { label: 'Ongoing', variant: 'success' }
  }
  else {
    return { label: 'Past', variant: 'neutral' }
  }
}

// Lifecycle hooks
onBeforeMount(fetchEvents)
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
        <EventFilters v-model:search="search" />

        <Flex gap="xs">
          <CalendarButtons />

          <!-- Create event button -->
          <Button
            v-if="canCreate"
            variant="accent"
            loading
            @click="openAddEventForm"
          >
            <template #start>
              <Icon name="ph:plus" />
            </template>
            Add Event
          </Button>
        </Flex>
      </Flex>

      <!-- Table skeleton -->
      <TableSkeleton
        :columns="3"
        :rows="10"
        :show-actions="canManageResource"
      />
    </Flex>
  </template>

  <Flex v-else gap="s" column expand>
    <!-- Header and filters -->
    <Flex x-between expand>
      <EventFilters v-model:search="search" />

      <Flex gap="xs">
        <CalendarButtons />

        <!-- Create event button -->
        <Button
          v-if="canCreate"
          variant="accent"
          @click="openAddEventForm"
        >
          <template #start>
            <Icon name="ph:plus" />
          </template>
          Add Event
        </Button>
      </Flex>
    </Flex>

    <!-- Table -->
    <TableContainer>
      <Table.Root v-if="rows.length > 0" separate-cells :loading="loading" class="mb-l">
        <template #header>
          <Table.Head v-for="header in headers.filter(header => header.label !== '_original')" :key="header.label" sort :header />
          <Table.Head
            key="status" :header="{ label: 'Status',
                                    sortToggle: () => {} }"
          />
          <Table.Head
            v-if="canManageResource"
            key="actions" :header="{ label: 'Actions',
                                     sortToggle: () => {} }"
          />
        </template>

        <template #body>
          <tr v-for="event in rows" :key="event._original.id" class="clickable-row" @click="viewEventDetails(event._original)">
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
              <Badge :variant="getEventStatus(event._original).variant">
                {{ getEventStatus(event._original).label }}
              </Badge>
            </Table.Cell>
            <Table.Cell v-if="canManageResource" @click.stop>
              <AdminActions
                resource-type="events"
                :item="event._original"
                :is-loading="(action: string) => isEventActionLoading(event._original.id, action)"
                @edit="(eventItem) => openEditEventForm(eventItem as Event)"
                @delete="(eventItem) => handleEventDelete((eventItem as Event).id)"
              />
            </Table.Cell>
          </tr>
        </template>

        <template v-if="transformedEvents.length > 10" #pagination>
          <Pagination :pagination="pagination" @change="setPage" />
        </template>
      </Table.Root>

      <!-- No results message -->
      <Alert v-else-if="!loading" variant="info">
        No events found
      </Alert>
    </TableContainer>

    <!-- Event Detail Sheet -->
    <EventDetails
      v-model:is-open="showEventDetails"
      :event="selectedEvent"
      @edit="handleEditFromDetails"
      @delete="(eventItem) => handleEventDelete((eventItem as Event).id)"
    />

    <!-- Event Form Sheet (for both create and edit) -->
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
.description-truncate {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
