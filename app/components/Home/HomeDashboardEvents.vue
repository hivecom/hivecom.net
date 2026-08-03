<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import HomeDashboardSection from '@/components/Home/HomeDashboardSection.vue'
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

const { events } = useDataEvents()
const { rsvpByEventId } = useDataUserRsvps()
const { mutualFriendIds } = useDataNotifications()
const { attendingByEventId } = useDataFriendRsvps(mutualFriendIds)

const upcoming = computed(() => events.value.filter(e => dayjs(e.date).isAfter(dayjs())))

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
    <HomeDashboardSection label="Your upcoming events">
      <EventSmall v-if="nextAttending" :data="nextAttending" compact no-glow />
      <p v-else>
        No upcoming event you RSVPed to.
      </p>
    </HomeDashboardSection>

    <HomeDashboardSection label="Friends are going">
      <template v-if="friendsAttending.length">
        <EventCompact v-for="{ event } in friendsAttending" :key="event.id" compact :data="event" no-glow />
      </template>
      <p v-else>
        Nothing your friends are on that you're missing.
      </p>
    </HomeDashboardSection>

    <HomeDashboardSection label="You could join these">
      <template v-if="suggested.length">
        <EventCompact v-for="event in suggested" :key="event.id" :data="event" no-glow />
      </template>
      <p v-else>
        No other upcoming events.
      </p>
    </HomeDashboardSection>
  </Flex>
</template>
