<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Badge, Button, Card, Flex, Grid, Sheet, Skeleton } from '@dolanske/vui'

import TimestampDate from '@/components/Shared/TimestampDate.vue'
import UserLink from '~/components/Shared/UserLink.vue'
import { formatDurationFromMinutes } from '~/utils/duration'

const props = defineProps<{
  event: Tables<'events'> | null
}>()

// Define emits
const emit = defineEmits(['edit'])

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// Handle closing the sheet
function handleClose() {
  isOpen.value = false
}

// Handle edit button click
function handleEdit() {
  emit('edit', props.event)
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
        <h4>Event Details</h4>
        <Flex y-center gap="s">
          <Badge
            v-if="props.event"
            :variant="getEventStatus(props.event).variant"
          >
            {{ getEventStatus(props.event).label }}
          </Badge>
          <Button
            v-if="props.event"
            @click="handleEdit"
          >
            <template #start>
              <Icon name="ph:pencil" />
            </template>
            Edit
          </Button>
        </Flex>
      </Flex>
    </template>

    <Flex v-if="props.event" column gap="m" class="event-detail">
      <Flex column gap="m" expand>
        <!-- Basic info -->
        <Card>
          <Flex column gap="l" expand>
            <Grid class="detail-item" expand :columns="2">
              <span class="detail-label">ID:</span>
              <span>{{ props.event.id }}</span>
            </Grid>

            <Grid class="detail-item" expand :columns="2">
              <span class="detail-label">Title:</span>
              <span>{{ props.event.title }}</span>
            </Grid>

            <Grid class="detail-item" expand :columns="2">
              <span class="detail-label">Date:</span>
              <TimestampDate :date="props.event.date" />
            </Grid>

            <Grid v-if="props.event.duration_minutes" class="detail-item" expand :columns="2">
              <span class="detail-label">Duration:</span>
              <span>{{ formatDurationFromMinutes(props.event.duration_minutes) }}</span>
            </Grid>

            <Grid v-if="props.event.location" class="detail-item" expand :columns="2">
              <span class="detail-label">Location:</span>
              <span>{{ props.event.location }}</span>
            </Grid>

            <Grid v-if="props.event.note" class="detail-item" expand :columns="2">
              <span class="detail-label">Note:</span>
              <span>{{ props.event.note }}</span>
            </Grid>

            <Grid v-if="props.event.link" class="detail-item" expand :columns="2">
              <span class="detail-label">Link:</span>
              <a :href="props.event.link" target="_blank" rel="noopener noreferrer" class="link">
                {{ props.event.link }}
                <Icon name="ph:arrow-square-out" />
              </a>
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

          <Suspense class="event-markdown" suspensible>
            <template #fallback>
              <Skeleton class="event-markdown-skeleton" height="320px" />
            </template>
            <MDC :partial="true" class="event-markdown-content typeset" value="# Test" />
          </Suspense>
        </Card>

        <!-- Metadata -->
        <Card separators>
          <template #header>
            <h6>Metadata</h6>
          </template>

          <Flex column gap="l" expand>
            <Grid class="detail-item" expand :columns="2">
              <span class="detail-label">Created:</span>
              <Flex column>
                <TimestampDate :date="props.event.created_at" />
                <Flex v-if="props.event.created_by" gap="xs" y-center class="metadata-by">
                  <span>by</span>
                  <UserLink :user-id="props.event.created_by" />
                </Flex>
              </Flex>
            </Grid>

            <Grid v-if="props.event.modified_at" class="detail-item" expand :columns="2">
              <span class="detail-label">Modified:</span>
              <Flex column>
                <TimestampDate :date="props.event.modified_at" />
                <Flex v-if="props.event.modified_by" gap="xs" y-center class="metadata-by">
                  <span>by</span>
                  <UserLink :user-id="props.event.modified_by" />
                </Flex>
              </Flex>
            </Grid>
          </Flex>
        </Card>
      </Flex>
    </Flex>
  </Sheet>
</template>

<style scoped>
.event-detail {
  padding-bottom: var(--space);
}

.detail-label {
  font-weight: 500;
  color: var(--color-text-light);
}

h4 {
  margin-top: 0;
  margin-bottom: var(--space-xs);
}

.metadata-by {
  font-size: 1.3rem;
  color: var(--color-text-light);
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
