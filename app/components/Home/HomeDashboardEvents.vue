<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import HomeDashboardCardHeader from '@/components/Home/HomeDashboardCardHeader.vue'
import HomeDashboardSection from '@/components/Home/HomeDashboardSection.vue'
import HomeDashboardSkeleton from '@/components/Home/HomeDashboardSkeleton.vue'
import { useDataEvents } from '@/composables/useDataEvents'
import { useDataFriendRsvps } from '@/composables/useDataFriendRsvps'
import { useDataNotifications } from '@/composables/useDataNotifications'
import { useDataUserRsvps } from '@/composables/useDataUserRsvps'
import EventCompact from '../Events/EventCompact.vue'
import EventSmall from '../Events/EventSmall.vue'

dayjs.extend(relativeTime)

// Raw data pass for the Events card: the next event I'm attending, events my
// friends RSVPed to that I haven't answered, and something to join beyond
// that. Deliberately unstyled - this is the data for the real dashboard.

const { events, loading: eventsLoading } = useDataEvents()
const { rsvpByEventId, loading: rsvpsLoading } = useDataUserRsvps()
const { mutualFriendIds } = useDataNotifications()
const { attendingByEventId, loading: friendRsvpsLoading } = useDataFriendRsvps(mutualFriendIds)

const upcoming = computed(() => events.value.filter(e => dayjs(e.date).isAfter(dayjs())))

// Every section here is derived from events plus RSVP state, so the card is
// only settled once both have landed. A cache hit fills `events` on the first
// tick and skips the skeleton entirely.
const loading = computed(() =>
  (eventsLoading.value || rsvpsLoading.value || friendRsvpsLoading.value) && upcoming.value.length === 0,
)

// Next event I said yes or tentative to.
const nextAttending = computed(() =>
  upcoming.value.find((e) => {
    const status = rsvpByEventId.value.get(e.id)
    return status === 'yes' || status === 'tentative'
  }) ?? null,
)

// Friends said yes, I haven't answered at all.
const friendsAttending = computed(() =>
  upcoming.value
    .filter(e => !rsvpByEventId.value.has(e.id) && (attendingByEventId.value.get(e.id)?.length ?? 0) > 0)
    .map(e => ({ event: e, friendIds: attendingByEventId.value.get(e.id) ?? [] }))
    .slice(0, 3),
)

// Nobody I know is on these yet - join CTA material.
const suggested = computed(() =>
  upcoming.value
    .filter(e => !rsvpByEventId.value.has(e.id) && (attendingByEventId.value.get(e.id)?.length ?? 0) === 0)
    .slice(0, 3),
)
</script>

<template>
  <Flex column gap="m">
    <HomeDashboardCardHeader title="Events" icon="ph:calendar" to="/events" />

    <HomeDashboardSkeleton v-if="loading" variant="block" />
    <HomeDashboardSection v-else label="Your upcoming events">
      <EventSmall v-if="nextAttending" :data="nextAttending" compact no-glow />
      <p v-else>
        No upcoming event you RSVPed to.
      </p>
    </HomeDashboardSection>

    <HomeDashboardSection v-if="!loading && friendsAttending.length" label="Friends are going">
      <EventCompact v-for="{ event } in friendsAttending" :key="event.id" compact :data="event" no-glow />
    </HomeDashboardSection>

    <HomeDashboardSkeleton v-if="loading" variant="rows" :count="3" />
    <HomeDashboardSection v-else-if="suggested.length" label="You could join these">
      <EventCompact v-for="event in suggested" :key="event.id" :data="event" no-glow />
    </HomeDashboardSection>
  </Flex>
</template>
