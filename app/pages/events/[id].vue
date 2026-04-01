<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Button, Flex } from '@dolanske/vui'
import Discussion from '@/components/Discussions/Discussion.vue'
import EventHeader from '@/components/Events/EventHeader.vue'
import EventMarkdown from '@/components/Events/EventMarkdown.vue'
import DetailStates from '@/components/Shared/DetailStates.vue'
import { useDataForumUnread } from '@/composables/useDataForumUnread'
import { useDataGames } from '@/composables/useDataGames'
import { useEventTiming } from '@/composables/useEventTiming'

// Get route parameter
const route = useRoute()
const eventId = Number.parseInt(route.params.id as string)

// Supabase client
const supabase = useSupabaseClient()

// Games from shared cache
const { getByIds } = useDataGames()

// Reactive data
const event = ref<Tables<'events'> | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

// Derive event games from the cached list
const games = computed(() => event.value?.games ? getByIds(event.value.games) : [])

defineOgImage('Event', {
  eventId,
})

const { isUpcoming, isOngoing, timeAgo, countdown } = useEventTiming(event)
const forumUnread = useDataForumUnread()

function handleReplySubmitted(newReplyCount: number, discussionId: string) {
  forumUnread.markDiscussionSeen(discussionId, newReplyCount)
}

// Fetch event data
async function fetchEvent() {
  try {
    loading.value = true
    error.value = null

    const { data, error: fetchError } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        error.value = 'Event not found'
      }
      else {
        error.value = fetchError.message
      }
      return
    }

    event.value = data
  }
  catch (err: unknown) {
    error.value = (err as Error).message || 'An error occurred while loading the event'
  }
  finally {
    loading.value = false
  }
}

// Fetch data on mount
onMounted(() => {
  fetchEvent()
})

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
      <Flex x-between>
        <Button
          variant="gray"
          plain
          size="s"
          aria-label="Go back to Events page"
          class="event-detail__back-link"
          @click="$router.push('/events')"
        >
          <template #start>
            <Icon name="ph:arrow-left" />
          </template>
          Back to Events
        </Button>
      </Flex>

      <!-- Header -->
      <div :class="{ 'event-ongoing': isOngoing }">
        <EventHeader
          :event="event"
          :games="games"
          :is-upcoming="isUpcoming"
          :is-ongoing="isOngoing"
          :countdown="countdown"
          :time-ago="timeAgo"
        />
      </div>

      <div class="event-detail__content">
        <!-- Markdown -->
        <EventMarkdown :event="event" />

        <!-- Related discussion -->
        <Discussion
          :id="String(event.id)"
          class="event-discussion"
          type="event"
          @reply-submitted="handleReplySubmitted"
        />
      </div>
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
