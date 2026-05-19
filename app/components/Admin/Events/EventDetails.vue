<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Badge, Button, Card, CopyClipboard, Flex, Sheet, Tooltip } from '@dolanske/vui'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import DetailRow from '@/components/Admin/Shared/DetailRow.vue'

import DetailTable from '@/components/Admin/Shared/DetailTable.vue'
import EventRSVPCount from '@/components/Events/EventRSVPCount.vue'
import EventRSVPModal from '@/components/Events/EventRSVPModal.vue'
import GameIcon from '@/components/Shared/GameIcon.vue'
import MarkdownRenderer from '@/components/Shared/MarkdownRenderer.vue'
import Metadata from '@/components/Shared/Metadata.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { useDataGames } from '@/composables/useDataGames'
import { formatDurationFromMinutes } from '@/lib/utils/duration'
import { humanizeRrule, nextOccurrenceDate } from '@/lib/utils/rrule'

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

  if (event.recurrence_rule) {
    const next = nextOccurrenceDate(event)
    if (next) {
      const nextEnd = event.duration_minutes
        ? new Date(next.getTime() + event.duration_minutes * 60 * 1000)
        : next
      if (now >= next && now <= nextEnd)
        return { label: 'Ongoing', variant: 'success' }
      return { label: 'Recurring', variant: 'accent' }
    }
    return { label: 'Past', variant: 'neutral' }
  }

  const eventStart = new Date(event.date)
  const eventEnd = event.duration_minutes
    ? new Date(eventStart.getTime() + event.duration_minutes * 60 * 1000)
    : eventStart

  if (now < eventStart)
    return { label: 'Upcoming', variant: 'accent' }
  else if (now >= eventStart && now <= eventEnd)
    return { label: 'Ongoing', variant: 'success' }
  else
    return { label: 'Past', variant: 'neutral' }
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
            <NuxtLink :to="`/events/${props.event.id}`" target="_blank">
              {{ props.event.title }}
            </NuxtLink>
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
        <DetailTable>
          <template #header>
            <Icon name="ph:calendar" />
            <h6>Overview</h6>
          </template>

          <DetailRow label="ID">
            <span class="text-s">{{ props.event.id }}</span>
          </DetailRow>

          <DetailRow label="Date" wrap>
            <TimestampDate size="s" :date="props.event.date" />
            <Badge
              v-if="props.event"
              :variant="getEventStatus(props.event).variant"
            >
              {{ getEventStatus(props.event).label }}
            </Badge>
          </DetailRow>

          <DetailRow label="Duration" :hidden="!props.event.duration_minutes">
            <span class="text-s">{{ props.event.duration_minutes ? formatDurationFromMinutes(props.event.duration_minutes) : '' }}</span>
          </DetailRow>

          <DetailRow label="Location" :hidden="!props.event.location">
            <span class="text-s">{{ props.event.location }}</span>
          </DetailRow>

          <DetailRow label="Note" :hidden="!props.event.note">
            <span class="text-s">{{ props.event.note }}</span>
          </DetailRow>

          <DetailRow label="Link" :hidden="!props.event.link">
            <NuxtLink v-if="props.event.link" external :href="props.event.link" target="_blank" rel="noopener noreferrer" class="link text-m">
              {{ props.event.link }}
              <Icon name="ph:arrow-square-out" />
            </NuxtLink>
          </DetailRow>

          <DetailRow label="Official">
            <Badge v-if="props.event.is_official" variant="accent">
              <template #start>
                <Icon name="ph:star-fill" size="12" />
              </template>
              Official
            </Badge>
            <span v-else class="text-color-lighter text-s">No</span>
          </DetailRow>

          <DetailRow label="Recurrence" wrap>
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
            <span v-if="!props.event.recurrence_rule && !props.event.recurrence_parent_id" class="text-color-lighter text-s">One-off</span>
          </DetailRow>

          <DetailRow label="RSVPs">
            <Button variant="link" class="btn-no-padding" @click="showRSVPModal = true">
              <EventRSVPCount :event="props.event" variant="info" size="s" :show-when-zero="true" />
            </Button>
          </DetailRow>

          <DetailRow label="Games" :hidden="!(props.event.games && props.event.games.length > 0)">
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
          </DetailRow>
        </DetailTable>

        <!-- Description -->
        <Card v-if="props.event.description" separators class="card-bg">
          <template #header>
            <Flex gap="xs" y-center>
              <Icon name="ph:text-align-left" />
              <h6>Description</h6>
            </Flex>
          </template>

          <p class="text-s">
            {{ props.event.description }}
          </p>
        </Card>

        <!-- Markdown Content -->
        <Card v-if="props.event.markdown" separators class="card-bg">
          <template #header>
            <Flex x-between y-center expand>
              <Flex y-center gap="xs">
                <Icon name="ph:article" />
                <h6>Content</h6>
              </Flex>
              <span class="text-color-lightest text-xs">Markdown</span>
            </Flex>
          </template>

          <MarkdownRenderer :md="props.event.markdown" class="event-markdown-content" />
        </Card>

        <!-- Sync status -->
        <DetailTable>
          <template #header>
            <Icon name="ph:arrows-clockwise" />
            <h6>Sync Status</h6>
          </template>

          <!-- Discord -->
          <DetailRow label="Discord">
            <Flex column :gap="0">
              <CopyClipboard v-if="props.event.discord_event_id" :text="props.event.discord_event_id">
                <code class="text-s text-color-light">{{ props.event.discord_event_id }}</code>
              </CopyClipboard>
              <span v-else class="text-color-lighter text-s">Not synced</span>
              <span v-if="props.event.discord_last_synced_at" class="text-s text-color-lighter">
                Last synced <TimestampDate :date="props.event.discord_last_synced_at" relative />
              </span>
            </Flex>
          </DetailRow>

          <!-- Google Calendar (official) -->
          <DetailRow label="Google (official)">
            <Flex column :gap="0">
              <CopyClipboard v-if="props.event.google_event_id" :text="props.event.google_event_id">
                <code class="text-s text-color-light">{{ props.event.google_event_id }}</code>
              </CopyClipboard>
              <span v-else class="text-color-lighter text-s">Not synced</span>
              <span v-if="props.event.google_last_synced_at" class="text-s text-color-lighter">
                Last synced <TimestampDate :date="props.event.google_last_synced_at" relative />
              </span>
            </Flex>
          </DetailRow>

          <!-- Google Calendar (community) -->
          <DetailRow label="Google (community)">
            <Flex column :gap="0">
              <CopyClipboard v-if="props.event.google_community_event_id" :text="props.event.google_community_event_id">
                <code class="text-s text-color-light">{{ props.event.google_community_event_id }}</code>
              </CopyClipboard>
              <span v-else class="text-color-lighter text-s">Not synced</span>
              <span v-if="props.event.google_community_last_synced_at" class="text-s text-color-lighter">
                Last synced <TimestampDate :date="props.event.google_community_last_synced_at" relative />
              </span>
            </Flex>
          </DetailRow>
        </DetailTable>

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

.btn-no-padding {
  padding-inline: 0;
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
