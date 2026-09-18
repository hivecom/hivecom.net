<script setup lang="ts">
import { Button, Flex } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import CreateEventModal from '@/components/Events/CreateEventModal.vue'
import HomeDashboardCalendar from '@/components/Home/HomeDashboardCalendar.vue'
import HomeDashboardCardHeader from '@/components/Home/HomeDashboardCardHeader.vue'
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

// Events card: what I'm going to, then everything else on the calendar I
// haven't answered. The top section is a two-up grid of tiles like the forum
// and games cards lead with, and the section under it is rows, so the three
// cards in the row read as one surface. Empty cells get a placeholder rather
// than collapsing, since a card that changes shape as events come and go pulls
// the row out of line.

const SHOWN_ATTENDING = 2
const SHOWN_OPEN = 3

const { events, loading: eventsLoading, refresh } = useDataEvents()
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

// Everything upcoming I haven't answered, friends first, since "someone you
// know is going" is the reason to look.
const openToJoin = computed(() => {
  const unanswered = upcoming.value.filter(e => !rsvpByEventId.value.has(e.id))
  const withFriends = unanswered.filter(e => (attendingByEventId.value.get(e.id)?.length ?? 0) > 0)
  const rest = unanswered.filter(e => (attendingByEventId.value.get(e.id)?.length ?? 0) === 0)

  return [...withFriends, ...rest]
})

// Sections swap rather than grow. The tile grid is mine when I'm going to
// something, with the open events as rows under it. When I'm not, the open
// events take the grid instead and the rows section goes away.
const gridIsMine = computed(() => attending.value.length > 0)
const gridEvents = computed(() => gridIsMine.value ? attending.value : openToJoin.value.slice(0, SHOWN_ATTENDING))
const rowEvents = computed(() => gridIsMine.value ? openToJoin.value.slice(0, SHOWN_OPEN) : [])

// The calendar only reports which day was clicked, so the create flow lives
// here. It's the same gate the events page puts in front of the button: agree
// to the content rules once, then the form opens.
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
    <template v-else>
      <!-- Only shows when something is actually running. Nothing is the normal
           state here, so a standing "nothing right now" would be permanent. -->
      <HomeDashboardSection v-if="happeningNow.length" label="Happening now">
        <div class="home-item-list">
          <HomeDashboardEventItem v-for="event in happeningNow" :key="event.id" :data="event" />
        </div>
      </HomeDashboardSection>

      <HomeDashboardSection :label="gridIsMine ? 'Your upcoming events' : 'You could join these'">
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
    </template>

    <!-- Nothing to join means no section. The calendar underneath already
         says the month is open, so a placeholder here would say it twice.
         No skeleton for it either: the rows only exist in one of the card's
         two states, and the month grid can't give up height to make room, so
         a placeholder here pushed the whole row taller than the cards beside
         it while loading. -->
    <HomeDashboardSection v-if="!loading && rowEvents.length" label="You could join these">
      <Flex column gap="xs">
        <HomeDashboardEventItem v-for="event in rowEvents" :key="event.id" inline :data="event" />
      </Flex>
    </HomeDashboardSection>

    <!-- The grid is the card's floor. However few events exist, the month is
         always the same height, and an empty day is a place to start one. -->
    <!-- The month name is the way to the full calendar. Same query the events
         page writes when its calendar tab is picked, so it lands on that tab. -->
    <HomeDashboardSection :label="dayjs().format('MMMM')" to="/events?tab=calendar" class="home-calendar-section">
      <HomeDashboardCalendar @create="openCreate" />
    </HomeDashboardSection>
  </Flex>

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
// The month grid takes whatever height the cards beside this one leave. The
// sections above it size to content (see the same override in the chat card).
.dashboard-fill > .dashboard-section {
  height: auto;
}

.home-calendar-section {
  flex: 1;
  display: flex;
  flex-direction: column;
}
</style>
