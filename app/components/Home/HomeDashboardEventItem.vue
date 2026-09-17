<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Badge, Flex, Skeleton } from '@dolanske/vui'
import dayjs from 'dayjs'
import { computed } from 'vue'
import EventHostAvatar from '@/components/Events/EventHostAvatar.vue'
import BulkAvatarDisplay from '@/components/Shared/BulkAvatarDisplay.vue'
import { useDataEventAttendees } from '@/composables/useDataEventAttendees'
import { useEventOrganizer } from '@/composables/useEventOrganizer'
import { useEventTiming } from '@/composables/useEventTiming'
import { fromNow } from '@/lib/utils/date'

// One event in the Events card. The dashboard used to bend EventSmall into this
// shape with a `compact` flag, which left it neither a real event card nor the
// same thing the forum and games cards put in their grids. This is the
// dashboard's own item, built on the shared `.home-item` so all three cards
// read as one surface.
const props = defineProps<{
  data: Tables<'events'>
  /** Row rather than tile, for the sections that are a list to scan. */
  inline?: boolean
}>()

const user = useSupabaseUser()
const { hasEventEnded, isOngoing } = useEventTiming(() => props.data)
const { userIds, count: rsvpCount, loading: loadingRsvps } = useDataEventAttendees(() => props.data.id)
const { organizerId, showOrganizer, attendees } = useEventOrganizer(() => props.data, userIds)

const isUpcoming = computed(() => dayjs(props.data.date).isAfter(dayjs()))
const timing = computed(() => isOngoing.value ? 'Ongoing' : fromNow(props.data.date))

// Signed out there are no avatars to draw, so the headcount badge stands in for
// the row instead.
const showPeople = computed(() => loadingRsvps.value || rsvpCount.value > 0 || showOrganizer.value)
</script>

<template>
  <div
    class="home-item home-event-item" :class="{ inline,
                                                'home-event-item--upcoming': isUpcoming || isOngoing }"
  >
    <!-- The title carries the click and stretches over the whole item, so the
         attendee avatars stay real profile links rather than nested anchors. -->
    <NuxtLink :to="`/events/${data.id}`" class="home-event-item__title" :draggable="false">
      <span v-if="!inline" class="home-event-item__date">{{ timing }}</span>
      <strong>{{ data.title }}</strong>
    </NuxtLink>

    <Flex y-center gap="s" class="home-event-item__foot" :expand="!inline" :x-between="!inline">
      <Badge v-if="!inline && user" :variant="data.is_official ? 'accent' : 'neutral'" size="s">
        {{ data.is_official ? 'Official' : 'Community' }}
      </Badge>
      <span v-if="inline" class="home-event-item__date">{{ timing }}</span>

      <Flex v-if="showPeople" y-center :gap="4" class="home-event-item__people">
        <EventHostAvatar v-if="showOrganizer" :user-id="organizerId!" :size="18" />
        <Skeleton v-if="loadingRsvps" :height="18" :width="56" :radius="4" />
        <template v-else>
          <BulkAvatarDisplay
            v-if="user && attendees.length > 0"
            :user-ids="attendees"
            :max-users="4"
            :avatar-size="18"
            :gap="6"
            :expand="false"
            :show-names="false"
            cluster
            :hide-generic-users="false"
          />
          <Badge v-else-if="!user && rsvpCount > 0" :variant="hasEventEnded ? 'neutral' : 'accent'" size="s">
            <Icon name="ph:users" />
            {{ rsvpCount }} {{ hasEventEnded ? 'Went' : 'Going' }}
          </Badge>
        </template>
      </Flex>
    </Flex>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/mixins.scss' as *;

.home-event-item {
  position: relative;
  justify-content: space-between;
  // `.home-item` is sized for a one-line title. This one wraps to two and sits
  // over a date and an avatar row, so it needs the room to breathe.
  gap: var(--space-xs);
  padding: var(--space-s);

  // Matches the block the forum subscriptions and the games art cards make, so
  // the three cards line up across the row.
  &:not(.inline) {
    min-height: 108px;
  }
}

.home-event-item__title {
  display: block;
  min-width: 0;
  color: inherit;

  // Click target covers the item, behind the avatars that lift above it.
  &::after {
    content: '';
    position: absolute;
    inset: 0;
  }

  strong {
    display: block;
    font-size: var(--font-size-m);
    line-height: 1.35;
    white-space: normal;
    @include line-clamp(2);
  }

  // Only the tile stacks the date over the title. On a row it rides in the foot
  // next to the avatars, where a bottom margin would knock it off centre.
  .home-event-item__date {
    margin-bottom: var(--space-xxs);
  }
}

// The date leads the tile and trails the row, so it reads as the first thing in
// a grid and the last thing in a list.
.home-event-item__date {
  display: block;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  color: var(--color-text-lighter);

  .home-event-item--upcoming & {
    color: var(--color-accent);
  }
}

.home-event-item__foot {
  flex-shrink: 0;
  margin-top: auto;
}

// Above the stretched title link, so a face is still a way into that profile.
.home-event-item__people {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
}

// Grey until the item is hovered, same as the event cards elsewhere, so a wall
// of avatars doesn't pull the eye before the titles do.
.home-event-item:not(.home-event-item--upcoming) .home-event-item__people {
  filter: grayscale(1);
}

.home-event-item:hover .home-event-item__people {
  filter: none;
}
</style>
