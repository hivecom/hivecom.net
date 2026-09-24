<script setup lang="ts">
import { Button, Flex } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import CreateEventModal from '@/components/Events/CreateEventModal.vue'
import HomeDashboardCalendar from '@/components/Home/HomeDashboardCalendar.vue'
import HomeDashboardCardHeader from '@/components/Home/HomeDashboardCardHeader.vue'
import HomeDashboardEventsSheet from '@/components/Home/HomeDashboardEventsSheet.vue'
import HomeDashboardPlaceholder from '@/components/Home/HomeDashboardPlaceholder.vue'
import HomeDashboardSection from '@/components/Home/HomeDashboardSection.vue'
import HomeDashboardSkeleton from '@/components/Home/HomeDashboardSkeleton.vue'
import ContentRulesModal from '@/components/Shared/ContentRulesModal.vue'
import { useContentRulesAgreement } from '@/composables/useContentRulesAgreement'
import { useDataEvents } from '@/composables/useDataEvents'
import { useDataFriendRsvps } from '@/composables/useDataFriendRsvps'
import { useDataNotifications } from '@/composables/useDataNotifications'
import { useDataUserRsvps } from '@/composables/useDataUserRsvps'
import { useOngoingEvents } from '@/composables/useOngoingEvents'
import HomeDashboardEventItem from './HomeDashboardEventItem.vue'

dayjs.extend(relativeTime)

// Empty cells get a placeholder rather than collapsing, since a card that changes
// shape as events come and go pulls the row out of line.

const SHOWN_ATTENDING = 2
const SHOWN_OPEN = 3

const { events, loading: eventsLoading, refresh } = useDataEvents()
const { rsvpByEventId, loading: rsvpsLoading } = useDataUserRsvps()
const { mutualFriendIds } = useDataNotifications()
const { attendingByEventId, loading: friendRsvpsLoading } = useDataFriendRsvps(mutualFriendIds)

// Ongoing events drop out of `upcoming` the moment they start
const { ongoingEvents } = useOngoingEvents()

const upcoming = computed(() => events.value.filter(e => dayjs(e.date).isAfter(dayjs())))

// Settled only once events and RSVPs have both landed. A cache hit skips the skeleton.
const loading = computed(() =>
  (eventsLoading.value || rsvpsLoading.value || friendRsvpsLoading.value)
  && upcoming.value.length === 0
  && ongoingEvents.value.length === 0,
)

const allAttending = computed(() =>
  upcoming.value.filter((e) => {
    const status = rsvpByEventId.value.get(e.id)
    return status === 'yes' || status === 'tentative'
  }),
)

const attending = computed(() => allAttending.value.slice(0, SHOWN_ATTENDING))

// Friends first, since someone you know going is the reason to look
const openToJoin = computed(() => {
  const unanswered = upcoming.value.filter(e => !rsvpByEventId.value.has(e.id))
  const withFriends = unanswered.filter(e => (attendingByEventId.value.get(e.id)?.length ?? 0) > 0)
  const rest = unanswered.filter(e => (attendingByEventId.value.get(e.id)?.length ?? 0) === 0)

  return [...withFriends, ...rest]
})

// Sections swap rather than grow. Without anything I'm attending, the open
// events take the grid and the rows section goes away.
const gridIsMine = computed(() => attending.value.length > 0)
const rowEvents = computed(() => gridIsMine.value ? openToJoin.value.slice(0, SHOWN_OPEN) : [])

// Ongoing events jump into the grid. A section of their own made the card taller
// than its neighbours.
const isLive = computed(() => ongoingEvents.value.length > 0)
const gridEvents = computed(() => {
  const next = gridIsMine.value ? attending.value : openToJoin.value

  return [...ongoingEvents.value, ...next].slice(0, SHOWN_ATTENDING)
})

const gridLabel = computed(() => {
  if (isLive.value)
    return 'On the radar'

  return gridIsMine.value ? 'Your upcoming events' : 'You could join these'
})

const eventsSheetOpen = ref(false)

function openEventsSheet(): void {
  eventsSheetOpen.value = true
}

// The calendar only reports the clicked day. Creating needs the content rules agreed first.
const showCreateEventModal = ref(false)
const showContentRulesModal = ref(false)
const createDate = ref<Date | null>(null)

const { agreed: contentRulesAgreed, markAgreed } = useContentRulesAgreement()

function openCreate(date: Date) {
  createDate.value = date

  if (contentRulesAgreed.value === true)
    showCreateEventModal.value = true
  else
    showContentRulesModal.value = true
}

function handleContentRulesConfirmed() {
  markAgreed()
  showCreateEventModal.value = true
}
</script>

<template>
  <Flex column gap="m" class="dashboard-fill">
    <HomeDashboardCardHeader title="Events" icon="ph:calendar" to="/events" />

    <HomeDashboardSkeleton v-if="loading" variant="cover" :count="SHOWN_ATTENDING" />
    <HomeDashboardSection v-else :label="gridLabel" @click="openEventsSheet">
      <div class="home-item-list">
        <HomeDashboardEventItem v-for="event in gridEvents" :key="event.id" :data="event" />

        <HomeDashboardPlaceholder v-if="!gridEvents.length" full message="Nothing on the calendar yet.">
          <Button size="s" variant="gray" @click="navigateTo('/events')">
            <template #start>
              <Icon name="ph:calendar-plus" />
            </template>
            Find an event
          </Button>
        </HomeDashboardPlaceholder>
      </div>
    </HomeDashboardSection>

    <!-- No placeholder or skeleton: the calendar already shows an open month, and
         the grid can't give up height, so either would make the card taller. -->
    <HomeDashboardSection v-if="!loading && rowEvents.length" label="You could join these">
      <Flex column gap="xs">
        <HomeDashboardEventItem v-for="event in rowEvents" :key="event.id" inline :data="event" />
      </Flex>
    </HomeDashboardSection>

    <HomeDashboardSection :label="dayjs().format('MMMM')" to="/events?tab=calendar" class="home-calendar-section">
      <HomeDashboardCalendar @create="openCreate" />
    </HomeDashboardSection>
  </Flex>

  <HomeDashboardEventsSheet
    :open="eventsSheetOpen"
    :ongoing="ongoingEvents"
    :attending="allAttending"
    :open-to-join="openToJoin"
    @close="eventsSheetOpen = false"
  />

  <CreateEventModal
    v-model:open="showCreateEventModal"
    :initial-date="createDate"
    @saved="refresh"
  />

  <ContentRulesModal
    v-model:open="showContentRulesModal"
    :show-agree-button="true"
    @confirm="handleContentRulesConfirmed"
  />
</template>

<style scoped lang="scss">
// The sections size to content so the month grid gets the leftover height
.dashboard-fill > .dashboard-section {
  height: auto;
}

.home-calendar-section {
  flex: 1;
  display: flex;
  flex-direction: column;
}
</style>
