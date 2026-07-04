<script setup lang="ts">
import { Badge, Flex } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import HomeDashboardSection from '@/components/Home/HomeDashboardSection.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
import { useDataEvents } from '@/composables/useDataEvents'
import { useDataFriendRsvps } from '@/composables/useDataFriendRsvps'
import { useDataNotifications } from '@/composables/useDataNotifications'
import { useDataUserRsvps } from '@/composables/useDataUserRsvps'

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
  <div>
    <HomeDashboardSection label="Next event you're attending">
      <div v-if="nextAttending">
        <Flex gap="xs" y-center>
          <NuxtLink :to="`/events/${nextAttending.id}`">
            <strong>{{ nextAttending.title }}</strong>
          </NuxtLink>
          <Badge v-if="nextAttending.is_official" variant="accent">
            Official
          </Badge>
        </Flex>
        <p>{{ dayjs(nextAttending.date).fromNow() }} ({{ nextAttending.date }})</p>
        <p>Your RSVP: {{ rsvpByEventId.get(nextAttending.id) }}</p>
        <p v-if="nextAttending.description">
          {{ nextAttending.description }}
        </p>
      </div>
      <p v-else>
        No upcoming event you RSVPed to.
      </p>
    </HomeDashboardSection>

    <HomeDashboardSection label="Friends are going, you haven't RSVPed">
      <ul v-if="friendsAttending.length">
        <li v-for="{ event, friendIds } in friendsAttending" :key="event.id">
          <NuxtLink :to="`/events/${event.id}`">
            <strong>{{ event.title }}</strong>
          </NuxtLink>
          - {{ dayjs(event.date).fromNow() }}
          <Flex gap="xs" wrap>
            <UserDisplay v-for="id in friendIds" :key="id" :user-id="id" size="s" />
          </Flex>
        </li>
      </ul>
      <p v-else>
        Nothing your friends are on that you're missing.
      </p>
    </HomeDashboardSection>

    <HomeDashboardSection label="You could join these">
      <ul v-if="suggested.length">
        <li v-for="event in suggested" :key="event.id">
          <NuxtLink :to="`/events/${event.id}`">
            {{ event.title }}
          </NuxtLink>
          - {{ dayjs(event.date).fromNow() }}
        </li>
      </ul>
      <p v-else>
        No other upcoming events.
      </p>
    </HomeDashboardSection>
  </div>
</template>
