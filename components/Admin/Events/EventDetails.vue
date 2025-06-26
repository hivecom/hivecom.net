<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Badge, Button, Card, Flex, Grid, Sheet } from '@dolanske/vui'

import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import EventRSVPCount from '@/components/Events/EventRSVPCount.vue'
import EventRSVPModal from '@/components/Events/EventRSVPModal.vue'
import MDRenderer from '@/components/Shared/MDRenderer.vue'
import Metadata from '@/components/Shared/Metadata.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { formatDurationFromMinutes } from '~/utils/duration'

const props = defineProps<{
  event: Tables<'events'> | null
}>()

// Define emits
const emit = defineEmits(['edit', 'delete'])

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// RSVP modal state
const showRSVPModal = ref(false)

// Handle closing the sheet
function handleClose() {
  isOpen.value = false
}

// Handle edit action from AdminActions
function handleEdit(event: Tables<'events'>) {
  emit('edit', event)
  isOpen.value = false
}

// Handle delete action from AdminActions
function handleDelete(event: Tables<'events'>) {
  emit('delete', event)
  isOpen.value = false
}

// Helper function to get event status
function getEventStatus(event: Tables<'events'>): { label: string, variant: 'accent' | 'success' | 'neutral' } {
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
</script>

<template>
  <Sheet
    :open="!!props.event && isOpen"
    position="right"
    separator
    :size="600"
    @close="handleClose"
  >
    <template #header>
      <Flex x-between y-center>
        <Flex column :gap="0">
          <h4>Event Details</h4>
          <span v-if="props.event" class="color-text-light text-xxs">
            {{ props.event.title }}
          </span>
        </Flex>
        <Flex y-center gap="s">
          <Badge
            v-if="props.event"
            :variant="getEventStatus(props.event).variant"
          >
            {{ getEventStatus(props.event).label }}
          </Badge>
          <AdminActions
            v-if="props.event"
            resource-type="events"
            :item="props.event"
            :show-labels="true"
            @edit="(eventItem) => handleEdit(eventItem as Tables<'events'>)"
            @delete="(eventItem) => handleDelete(eventItem as Tables<'events'>)"
          />
        </Flex>
      </Flex>
    </template>

    <Flex v-if="props.event" column gap="m" class="event-detail">
      <Flex column gap="m" expand>
        <!-- Basic info -->
        <Card>
          <Flex column gap="l" expand>
            <Grid class="detail-item" expand :columns="2">
              <span class="color-text-light text-bold">ID:</span>
              <span>{{ props.event.id }}</span>
            </Grid>

            <Grid class="detail-item" expand :columns="2">
              <span class="color-text-light text-bold">Title:</span>
              <span>{{ props.event.title }}</span>
            </Grid>

            <Grid class="detail-item" expand :columns="2">
              <span class="color-text-light text-bold">Date:</span>
              <TimestampDate size="m" :date="props.event.date" />
            </Grid>

            <Grid v-if="props.event.duration_minutes" class="detail-item" expand :columns="2">
              <span class="color-text-light text-bold">Duration:</span>
              <span>{{ formatDurationFromMinutes(props.event.duration_minutes) }}</span>
            </Grid>

            <Grid v-if="props.event.location" class="detail-item" expand :columns="2">
              <span class="color-text-light text-bold">Location:</span>
              <span>{{ props.event.location }}</span>
            </Grid>

            <Grid v-if="props.event.note" class="detail-item" expand :columns="2">
              <span class="color-text-light text-bold">Note:</span>
              <span>{{ props.event.note }}</span>
            </Grid>

            <Grid v-if="props.event.link" class="detail-item" expand :columns="2">
              <span class="color-text-light text-bold">Link:</span>
              <NuxtLink external :href="props.event.link" target="_blank" rel="noopener noreferrer" class="link text-m">
                {{ props.event.link }}
                <Icon name="ph:arrow-square-out" />
              </NuxtLink>
            </Grid>

            <Grid class="detail-item" expand :columns="2">
              <span class="color-text-light text-bold">RSVPs:</span>
              <Flex gap="xs" y-center>
                <EventRSVPCount
                  :event="props.event"
                  variant="info"
                  size="s"
                  :show-when-zero="true"
                />
                <Button
                  variant="gray"
                  size="s"
                  @click="showRSVPModal = true"
                >
                  View Details
                </Button>
              </Flex>
            </Grid>
          </Flex>
        </Card>

        <!-- Description -->
        <Card v-if="props.event.description" separators>
          <template #header>
            <h6>Description</h6>
          </template>

          <p>{{ props.event.description }}</p>
        </Card>

        <!-- Markdown Content -->
        <Card v-if="props.event.markdown" separators>
          <template #header>
            <h6>Markdown</h6>
          </template>

          <MDRenderer :md="props.event.markdown" class="event-markdown-content" />
        </Card>

        <!-- Metadata -->
        <Metadata
          :created-at="props.event.created_at"
          :created-by="props.event.created_by"
          :modified-at="props.event.modified_at"
          :modified-by="props.event.modified_by"
        />
      </Flex>
    </Flex>

    <!-- RSVP Modal -->
    <EventRSVPModal
      v-if="props.event"
      v-model:open="showRSVPModal"
      :event="props.event"
      @close="showRSVPModal = false"
    />
  </Sheet>
</template>

<style scoped lang="scss">
.event-detail {
  padding-bottom: var(--space);
}

.event-markdown {
  width: 100%;
}

.event-markdown-skeleton {
  width: 100%;
}

.event-markdown-content {
  h1 {
    margin-top: var(--space-s);
    font-size: var(--font-size-xxl);
  }

  h2 {
    margin-top: var(--space-s);
    font-size: var(--font-size-xxl);
  }
}

.link {
  color: var(--color-accent);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
}

.link:hover {
  text-decoration: underline;
}
</style>
