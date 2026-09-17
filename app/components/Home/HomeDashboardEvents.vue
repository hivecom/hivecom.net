<script setup lang="ts">
import { Button, Flex } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import HomeDashboardCardHeader from '@/components/Home/HomeDashboardCardHeader.vue'
import HomeDashboardPlaceholder from '@/components/Home/HomeDashboardPlaceholder.vue'
import HomeDashboardSection from '@/components/Home/HomeDashboardSection.vue'
import HomeDashboardSkeleton from '@/components/Home/HomeDashboardSkeleton.vue'
import { useDataEvents } from '@/composables/useDataEvents'
import { useDataFriendRsvps } from '@/composables/useDataFriendRsvps'
import { useDataNotifications } from '@/composables/useDataNotifications'
import { useDataUserRsvps } from '@/composables/useDataUserRsvps'
import { useOngoingEvents } from '@/composables/useOngoingEvents'
import HomeDashboardEventItem from './HomeDashboardEventItem.vue'

dayjs.extend(relativeTime)

// Events card: what I'm going to, then everything else on the calendar I
// haven't answered. The top section is a two-up grid of tiles like the forum
// and games cards lead with, and the section under it is rows, so the three
// cards in the row read as one surface. Empty cells get a placeholder rather
// than collapsing, since a card that changes shape as events come and go pulls
// the row out of line.

const SHOWN_ATTENDING = 2
const SHOWN_OPEN = 3

const { events, loading: eventsLoading } = useDataEvents()
const { rsvpByEventId, loading: rsvpsLoading } = useDataUserRsvps()
const { mutualFriendIds } = useDataNotifications()
const { attendingByEventId, loading: friendRsvpsLoading } = useDataFriendRsvps(mutualFriendIds)

// Started but not over yet. These fall out of `upcoming` the moment they begin,
// so without their own section the event you're meant to be at right now is the
// one thing the card won't show you.
const { ongoingEvents } = useOngoingEvents()

const happeningNow = computed(() => ongoingEvents.value.slice(0, 2))

const upcoming = computed(() => events.value.filter(e => dayjs(e.date).isAfter(dayjs())))

// Every section here is derived from events plus RSVP state, so the card is
// only settled once both have landed. A cache hit fills `events` on the first
// tick and skips the skeleton entirely.
const loading = computed(() =>
  (eventsLoading.value || rsvpsLoading.value || friendRsvpsLoading.value)
  && upcoming.value.length === 0
  && happeningNow.value.length === 0,
)

// Upcoming events I said yes or tentative to, soonest first.
const attending = computed(() =>
  upcoming.value
    .filter((e) => {
      const status = rsvpByEventId.value.get(e.id)
      return status === 'yes' || status === 'tentative'
    })
    .slice(0, SHOWN_ATTENDING),
)

// Everything upcoming I haven't answered, whether or not anyone I know is on
// it. Friends first, since "someone you know is going" is the reason to look,
// and the avatars on those rows say so without a section header having to.
const openToJoin = computed(() => {
  const unanswered = upcoming.value.filter(e => !rsvpByEventId.value.has(e.id))
  const withFriends = unanswered.filter(e => (attendingByEventId.value.get(e.id)?.length ?? 0) > 0)
  const rest = unanswered.filter(e => (attendingByEventId.value.get(e.id)?.length ?? 0) === 0)

  return [...withFriends, ...rest].slice(0, SHOWN_OPEN)
})
</script>

<template>
  <Flex column gap="m">
    <HomeDashboardCardHeader title="Events" icon="ph:calendar" to="/events" />

    <HomeDashboardSkeleton v-if="loading" variant="cover" :count="SHOWN_ATTENDING" />
    <template v-else>
      <!-- Only shows when something is actually running. Nothing is the normal
           state here, so a standing "nothing right now" would be permanent. -->
      <HomeDashboardSection v-if="happeningNow.length" label="Happening now">
        <div class="home-item-list">
          <HomeDashboardEventItem v-for="event in happeningNow" :key="event.id" :data="event" />
        </div>
      </HomeDashboardSection>

      <HomeDashboardSection label="Your upcoming events">
        <div class="home-item-list">
          <HomeDashboardEventItem v-for="event in attending" :key="event.id" :data="event" />

          <HomeDashboardPlaceholder v-if="!attending.length" full message="Nothing on your calendar yet.">
            <Button size="s" variant="gray" @click="navigateTo('/events')">
              <template #start>
                <Icon name="ph:calendar-plus" />
              </template>
              Find an event
            </Button>
          </HomeDashboardPlaceholder>
        </div>
      </HomeDashboardSection>
    </template>

    <HomeDashboardSkeleton v-if="loading" variant="rows" :count="SHOWN_OPEN" />
    <HomeDashboardSection v-else label="You could join these">
      <Flex column gap="xs">
        <HomeDashboardEventItem v-for="event in openToJoin" :key="event.id" inline :data="event" />
        <HomeDashboardPlaceholder v-if="!openToJoin.length" inline>
          <template #message>
            Nothing else on the calendar.
            <NuxtLink to="/events?create=1" class="link-line">
              Go organize something?
            </NuxtLink>
          </template>
        </HomeDashboardPlaceholder>
      </Flex>
    </HomeDashboardSection>
  </Flex>
</template>
