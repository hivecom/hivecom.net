<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Button, Dropdown, DropdownItem, Flex } from '@dolanske/vui'
import Discussion from '@/components/Discussions/Discussion.vue'
import CreateEventModal from '@/components/Events/CreateEventModal.vue'
import EventHeader from '@/components/Events/EventHeader.vue'
import EventMarkdown from '@/components/Events/EventMarkdown.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import DetailStates from '@/components/Shared/DetailStates.vue'
import { useCachedFetch } from '@/composables/useCache'
import { useDataForumUnread } from '@/composables/useDataForumUnread'
import { useDataGames } from '@/composables/useDataGames'
import { useDataUser } from '@/composables/useDataUser'
import { useEventTiming } from '@/composables/useEventTiming'
import { useBreakpoint } from '@/lib/mediaQuery'
import { expandRecurringEvent, nextOccurrenceDate } from '@/lib/utils/rrule'

const isMobile = useBreakpoint('<s')

// Get route parameter
const route = useRoute()
const eventId = Number.parseInt(route.params.id as string)

// Supabase client
const supabase = useSupabaseClient()

// Games from shared cache
const { getByIds } = useDataGames()

// Fetch event with caching
const { data: event, loading, error, refetch: refetchEvent } = useCachedFetch<Tables<'events'>>(
  () => ({
    table: 'events',
    select: '*',
    filters: { id: eventId },
    single: true,
  }),
  { ttl: 60000 },
)

// Derive event games from the cached list
const games = computed(() => event.value?.games ? getByIds(event.value.games as number[]) : [])

defineOgImage('Event', {
  eventId,
})

const mutableEvent = computed(() => event.value as Tables<'events'> | null)

// For recurring series, timing should reflect the next upcoming occurrence
// (for countdown) or the last occurrence (for timeAgo), not the stored origin.
const effectiveEventForTiming = computed(() => {
  const ev = mutableEvent.value
  if (!ev || !ev.recurrence_rule)
    return ev

  // If there's a next occurrence coming up, show countdown to it.
  const next = nextOccurrenceDate(ev)
  if (next)
    return { ...ev, date: next.toISOString() }

  // No next occurrence - series ended. Find the last past occurrence so
  // timeAgo is relative to when it actually last ran, not the origin date.
  const now = new Date()
  const past = expandRecurringEvent(ev, new Date(ev.date), now)
  if (past.length > 0) {
    const last = past[past.length - 1]!
    return { ...ev, date: last.date }
  }

  return ev
})

const { isUpcoming, isOngoing, timeAgo, countdown } = useEventTiming(effectiveEventForTiming)
const forumUnread = useDataForumUnread()

function handleReplySubmitted(newReplyCount: number, discussionId: string) {
  forumUnread.markDiscussionSeen(discussionId, newReplyCount)
}

// Edit permissions
const userId = useUserId()
const { user: currentUserData } = useDataUser(userId, { includeRole: true, includeAvatar: false })

const canEdit = computed(() => {
  if (!event.value || !userId.value)
    return false
  const isOwner = event.value.created_by === userId.value && !event.value.is_official
  const isPrivileged = currentUserData.value?.role === 'admin' || currentUserData.value?.role === 'moderator'
  return isOwner || isPrivileged
})

const showEditModal = ref(false)

// Delete
const deleteLoading = ref(false)
const deleteConfirm = ref(false)

async function handleDelete() {
  if (!event.value)
    return

  deleteLoading.value = true

  try {
    const { error: deleteError } = await supabase
      .from('events')
      .delete()
      .eq('id', eventId)

    if (deleteError)
      throw deleteError

    await navigateTo('/events')
  }
  catch {
    deleteLoading.value = false
    deleteConfirm.value = false
  }
}

// SEO and page metadata
useSeoMeta({
  title: computed(() => event.value ? `${event.value.title} | Events` : 'Event Details'),
  description: computed(() => event.value?.description || 'Event details'),
  ogTitle: computed(() => event.value ? `${event.value.title} | Events` : 'Event Details'),
  ogDescription: computed(() => event.value?.description || 'Event details'),
})

// Page title
useHead({
  title: computed(() => event.value ? event.value.title : 'Event Details'),
})
</script>

<template>
  <div class="page">
    <div :class="!isMobile && 'container-m'">
      <ClientOnly>
        <!-- Loading and Error States -->
        <DetailStates
          :loading="loading"
          :error="error"
          back-to="/events"
          back-label="Events"
        >
          <template #error-message>
            We are unable to load event details at this time. Please try again later.
          </template>
        </DetailStates>

        <!-- Event Content -->
        <div v-if="event && !loading && !error" class="event-detail">
          <!-- Back Button -->
          <Flex x-between y-center>
            <NuxtLink to="/events">
              <Button
                variant="gray"
                plain
                size="s"
                aria-label="Go back to Events page"
                class="event-detail__back-link"
              >
                <template #start>
                  <Icon name="ph:arrow-left" />
                </template>
                Back to Events
              </Button>
            </NuxtLink>

            <Dropdown v-if="canEdit">
              <template #trigger="{ toggle }">
                <Button variant="gray" size="s" @click="toggle">
                  Manage
                </Button>
              </template>
              <DropdownItem @click="showEditModal = true">
                Edit
              </DropdownItem>
              <DropdownItem variant="danger" @click="deleteConfirm = true">
                Delete
              </DropdownItem>
            </Dropdown>
          </Flex>

          <!-- Header -->
          <div :class="{ 'event-ongoing': isOngoing }">
            <EventHeader
              :event="effectiveEventForTiming!"
              :games="games"
              :is-upcoming="isUpcoming"
              :is-ongoing="isOngoing"
              :countdown="countdown"
              :time-ago="timeAgo"
            />
          </div>

          <div class="event-detail__content">
            <!-- Markdown -->
            <EventMarkdown :event="mutableEvent!" />

            <!-- Related discussion -->
            <Discussion
              :id="String(event.id)"
              class="event-discussion"
              type="event"
              @reply-submitted="handleReplySubmitted"
            />
          </div>
        </div>

        <CreateEventModal v-model:open="showEditModal" :event="mutableEvent" @saved="refetchEvent" />

        <ConfirmModal
          v-if="event"
          v-model:open="deleteConfirm"
          :confirm-loading="deleteLoading"
          title="Delete event"
          :description="`Are you sure you want to delete '${event.title}'? This cannot be undone.`"
          confirm-text="Delete"
          :destructive="true"
          @confirm="handleDelete"
        />
      </ClientOnly>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.event-detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-l);

  &__back-link {
    text-decoration: none;
  }

  &__content {
    display: flex;
    flex-direction: column;
    gap: var(--space-l);
  }
}

/* .event-discussion {
  max-width: 728px;
} */
</style>
