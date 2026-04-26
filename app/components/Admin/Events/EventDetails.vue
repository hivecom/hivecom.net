<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Badge, Button, Card, CopyClipboard, Flex, Grid, Sheet, Tooltip } from '@dolanske/vui'

import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import EventRSVPCount from '@/components/Events/EventRSVPCount.vue'
import EventRSVPModal from '@/components/Events/EventRSVPModal.vue'
import GameIcon from '@/components/GameServers/GameIcon.vue'
import MarkdownRenderer from '@/components/Shared/MarkdownRenderer.vue'
import Metadata from '@/components/Shared/Metadata.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { useDataGames } from '@/composables/useDataGames'
import { formatDurationFromMinutes } from '@/lib/utils/duration'
import { humanizeRrule } from '@/lib/utils/rrule'

const props = defineProps<{
  event: Tables<'events'> | null
}>()

// Define emits
const emit = defineEmits(['edit', 'delete'])

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// RSVP modal state
const showRSVPModal = ref(false)

// Games data
const { loading: loadingGames, getByIds } = useDataGames()

const eventGames = computed(() => {
  if (!props.event?.games || props.event.games.length === 0)
    return []
  return getByIds(props.event.games)
})

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
    :card="{ separators: true }"
    :size="600"
    @close="handleClose"
  >
    <template #header>
      <Flex x-between y-center class="pr-s">
        <Flex column :gap="0">
          <h4>Event Details</h4>
          <p v-if="props.event" class="text-color-light text-xs">
            {{ props.event.title }}
          </p>
        </Flex>
        <Flex y-center gap="s">
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
        <Card class="card-bg">
          <Flex column gap="l" expand>
            <Grid class="detail-item" expand columns="1fr 2fr">
              <span class="text-color-light text-bold">ID:</span>
              <span>{{ props.event.id }}</span>
            </Grid>

            <Grid class="detail-item" expand columns="1fr 2fr">
              <span class="text-color-light text-bold">Title:</span>
              <span>{{ props.event.title }}</span>
            </Grid>

            <Grid class="detail-item" expand columns="1fr 2fr">
              <span class="text-color-light text-bold">Date:</span>
              <Flex wrap y-center>
                <TimestampDate size="m" :date="props.event.date" />
                <Badge
                  v-if="props.event"
                  :variant="getEventStatus(props.event).variant"
                >
                  {{ getEventStatus(props.event).label }}
                </Badge>
              </Flex>
            </Grid>

            <Grid v-if="props.event.duration_minutes" class="detail-item" expand columns="1fr 2fr">
              <span class="text-color-light text-bold">Duration:</span>
              <span>{{ formatDurationFromMinutes(props.event.duration_minutes) }}</span>
            </Grid>

            <Grid v-if="props.event.location" class="detail-item" expand columns="1fr 2fr">
              <span class="text-color-light text-bold">Location:</span>
              <span>{{ props.event.location }}</span>
            </Grid>

            <Grid v-if="props.event.note" class="detail-item" expand columns="1fr 2fr">
              <span class="text-color-light text-bold">Note:</span>
              <span>{{ props.event.note }}</span>
            </Grid>

            <Grid v-if="props.event.link" class="detail-item" expand columns="1fr 2fr">
              <span class="text-color-light text-bold">Link:</span>
              <NuxtLink external :href="props.event.link" target="_blank" rel="noopener noreferrer" class="link text-m">
                {{ props.event.link }}
                <Icon name="ph:arrow-square-out" />
              </NuxtLink>
            </Grid>

            <Grid class="detail-item" expand columns="1fr 2fr">
              <span class="text-color-light text-bold">Official:</span>
              <Flex gap="xs" y-center>
                <Badge v-if="props.event.is_official" variant="accent">
                  <template #start>
                    <Icon name="ph:star-fill" size="12" />
                  </template>
                  Official
                </Badge>
                <span v-else class="text-color-lighter">No</span>
              </Flex>
            </Grid>

            <Grid class="detail-item" expand columns="1fr 2fr">
              <span class="text-color-light text-bold">Recurrence:</span>
              <Flex gap="xs" y-center>
                <Badge v-if="props.event.recurrence_rule" variant="neutral">
                  <template #start>
                    <Icon name="ph:arrows-clockwise" size="12" />
                  </template>
                  {{ humanizeRrule(props.event.recurrence_rule) }}
                </Badge>
                <Tooltip v-if="props.event.recurrence_parent_id" text="This event is a child occurrence of a recurring series">
                  <Badge variant="neutral">
                    <template #start>
                      <Icon name="ph:link" size="12" />
                    </template>
                    Child occurrence
                  </Badge>
                </Tooltip>
                <Tooltip v-if="props.event.recurrence_exception" text="This occurrence has been individually overridden within its series">
                  <Badge variant="warning">
                    <template #start>
                      <Icon name="ph:warning" size="12" />
                    </template>
                    Exception
                  </Badge>
                </Tooltip>
                <span v-if="!props.event.recurrence_rule && !props.event.recurrence_parent_id" class="text-color-lighter">One-off</span>
              </Flex>
            </Grid>

            <Grid class="detail-item" expand columns="1fr 2fr">
              <span class="text-color-light text-bold">RSVPs:</span>
              <Flex gap="xs" y-center wrap>
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

            <!-- Games -->
            <Grid v-if="props.event.games && props.event.games.length > 0" class="detail-item" expand columns="1fr 2fr">
              <span class="text-color-light text-bold">Games:</span>
              <Flex gap="xs" y-center>
                <!-- Loading state -->
                <div v-if="loadingGames" class="game-skeleton-container">
                  <div v-for="n in (props.event.games?.length || 1)" :key="n" class="game-skeleton" />
                </div>
                <!-- Games icons -->
                <template v-else>
                  <GameIcon
                    v-for="game in eventGames"
                    :key="game.id"
                    :game="game"
                    size="s"
                  />
                </template>
              </Flex>
            </Grid>
          </Flex>
        </Card>

        <!-- Description -->
        <Card v-if="props.event.description" separators class="card-bg">
          <template #header>
            <h6>Description</h6>
          </template>

          <p>{{ props.event.description }}</p>
        </Card>

        <!-- Markdown Content -->
        <Card v-if="props.event.markdown" separators class="card-bg">
          <template #header>
            <h6>Markdown</h6>
          </template>

          <MarkdownRenderer :md="props.event.markdown" class="event-markdown-content" />
        </Card>

        <!-- Sync status -->
        <Card separators class="card-bg">
          <template #header>
            <h6>Sync Status</h6>
          </template>

          <Flex column gap="l" expand>
            <!-- Discord -->
            <Grid class="detail-item" expand columns="1fr 2fr">
              <Flex gap="xs" y-center>
                <Icon name="ph:discord-logo" size="14" class="text-color-light" />
                <span class="text-color-light text-bold">Discord:</span>
              </Flex>
              <Flex column :gap="0">
                <CopyClipboard v-if="props.event.discord_event_id" :text="props.event.discord_event_id">
                  <span class="text-xs text-mono text-color-light">{{ props.event.discord_event_id }}</span>
                </CopyClipboard>
                <span v-else class="text-color-lighter text-xs">Not synced</span>
                <span v-if="props.event.discord_last_synced_at" class="text-xs text-color-lighter">
                  Last synced <TimestampDate :date="props.event.discord_last_synced_at" relative />
                </span>
              </Flex>
            </Grid>

            <!-- Google Calendar (official) -->
            <Grid class="detail-item" expand columns="1fr 2fr">
              <Flex gap="xs" y-center>
                <Icon name="ph:google-logo" size="14" class="text-color-light" />
                <span class="text-color-light text-bold">Official:</span>
              </Flex>
              <Flex column :gap="0">
                <CopyClipboard v-if="props.event.google_event_id" :text="props.event.google_event_id">
                  <span class="text-xs text-mono text-color-light">{{ props.event.google_event_id }}</span>
                </CopyClipboard>
                <span v-else class="text-color-lighter text-xs">Not synced</span>
                <span v-if="props.event.google_last_synced_at" class="text-xs text-color-lighter">
                  Last synced <TimestampDate :date="props.event.google_last_synced_at" relative />
                </span>
              </Flex>
            </Grid>

            <!-- Google Calendar (community) -->
            <Grid class="detail-item" expand columns="1fr 2fr">
              <Flex gap="xs" y-center>
                <Icon name="ph:google-logo" size="14" class="text-color-light" />
                <span class="text-color-light text-bold">Community:</span>
              </Flex>
              <Flex column :gap="0">
                <CopyClipboard v-if="props.event.google_community_event_id" :text="props.event.google_community_event_id">
                  <span class="text-xs text-mono text-color-light">{{ props.event.google_community_event_id }}</span>
                </CopyClipboard>
                <span v-else class="text-color-lighter text-xs">Not synced</span>
                <span v-if="props.event.google_community_last_synced_at" class="text-xs text-color-lighter">
                  Last synced <TimestampDate :date="props.event.google_community_last_synced_at" relative />
                </span>
              </Flex>
            </Grid>
          </Flex>
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

.game-skeleton-container {
  display: flex;
  gap: var(--space-xs);
}

.game-skeleton {
  width: 24px;
  height: 24px;
  border-radius: var(--border-radius-s);
  background: var(--color-background-secondary);
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
