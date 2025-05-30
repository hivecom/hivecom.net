<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Badge, Card, Flex, Grid, Sheet, Skeleton } from '@dolanske/vui'

import TimestampDate from '@/components/Shared/TimestampDate.vue'
import Metadata from '~/components/Shared/Metadata.vue'

const props = defineProps<{
  event: Tables<'events'> | null
}>()

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// Handle closing the sheet
function handleClose() {
  isOpen.value = false
}

// Helper function to check if event is upcoming
function isUpcoming(eventDate: string): boolean {
  return new Date(eventDate) >= new Date()
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
        <h4>{{ props.event ? props.event.title : 'Event Details' }}</h4>
        <Badge
          v-if="props.event"
          :variant="isUpcoming(props.event.date) ? 'accent' : 'neutral'"
        >
          {{ isUpcoming(props.event.date) ? 'Upcoming' : 'Past' }}
        </Badge>
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
              <span class="detail-label">Date:</span>
              <TimestampDate :date="props.event.date" />
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
            <h6>Details</h6>
          </template>

          <Suspense class="event-markdown" suspensible>
            <template #fallback>
              <Skeleton class="event-markdown-skeleton" height="320px" />
            </template>
            <MDC :partial="true" class="event-markdown-content typeset" :value="props.event.markdown" />
          </Suspense>
        </Card>

        <!-- Metadata -->
        <Card separators>
          <template #header>
            <h6>Metadata</h6>
          </template>

          <Metadata
            :created-at="props.event.created_at"
            :created-by="props.event.created_by"
            :modified-at="props.event.modified_at"
            :modified-by="props.event.modified_by"
          />
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
