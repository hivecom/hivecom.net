<script setup lang="ts">
import type { Tables, TablesInsert, TablesUpdate } from '~/types/database.types'
import { Alert, Badge, Button, defineTable, Flex, Pagination, Table } from '@dolanske/vui'
import { computed, onBeforeMount, ref } from 'vue'

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
const { hasPermission } = useAdminPermissions()

// Permission checks
const canCreateEvents = computed(() => hasPermission('events.create'))
const canUpdateEvents = computed(() => hasPermission('events.update'))

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
  catch (error: any) {
    errorMessage.value = error.message || 'An error occurred while loading events'
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

      const { error } = await supabase
        .from('events')
        .insert(createData)

      if (error)
        throw error
    }

    // Refresh events data and close form
    showEventForm.value = false
    await fetchEvents()
  }
  catch (error: any) {
    errorMessage.value = error.message || 'An error occurred while saving the event'
  }
}

// Handle event deletion
async function handleEventDelete(eventId: number) {
  try {
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', eventId)

    if (error)
      throw error

    showEventForm.value = false
    await fetchEvents()
  }
  catch (error: any) {
    errorMessage.value = error.message || 'An error occurred while deleting the event'
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
  <Alert v-else-if="loading" variant="info">
    Loading events...
  </Alert>

  <Flex v-else gap="s" column expand>
    <!-- Header and filters -->
    <Flex x-between expand>
      <EventFilters v-model:search="search" />

      <Button
        v-if="canCreateEvents"
        variant="accent"
        @click="openAddEventForm"
      >
        <template #start>
          <Icon name="ph:plus" />
        </template>
        Add Event
      </Button>
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
            <Table.Cell @click.stop>
              <Flex gap="xs">
                <Button
                  v-if="canUpdateEvents"
                  square
                  size="s"
                  data-title-top="Edit Event"
                  icon="ph:pencil"
                  @click="(clickEvent: MouseEvent) => openEditEventForm(event._original, clickEvent)"
                >
                  Edit
                </Button>
              </Flex>
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
.description-truncate {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
