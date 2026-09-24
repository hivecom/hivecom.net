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

// Built on the shared `.home-item` so the events, forum and games cards read as one surface
const props = defineProps<{
  data: Tables<'events'>
  /** Row rather than tile */
  inline?: boolean
}>()

const user = useSupabaseUser()
const { hasEventEnded, isOngoing } = useEventTiming(() => props.data)
const { userIds, count: rsvpCount, loading: loadingRsvps } = useDataEventAttendees(() => props.data.id)
const { organizerId, showOrganizer, attendees } = useEventOrganizer(() => props.data, userIds)

const isUpcoming = computed(() => dayjs(props.data.date).isAfter(dayjs()))
const timing = computed(() => isOngoing.value ? 'Ongoing' : fromNow(props.data.date))

// Signed out, the headcount badge stands in for the avatar row.
const showPeople = computed(() => loadingRsvps.value || rsvpCount.value > 0 || showOrganizer.value)
</script>

<template>
  <div
    class="home-item home-event-item" :class="{ inline,
                                                'home-event-item--upcoming': isUpcoming || isOngoing }"
  >
    <!-- The title's click stretches over the item, so the avatars aren't nested anchors -->
    <NuxtLink :to="`/events/${data.id}`" class="home-event-item__title" :draggable="false">
      <span v-if="!inline" class="home-event-item__date">
        <span v-if="isOngoing" class="home-event-item__live-dot" />
        {{ timing }}
      </span>
      <strong>{{ data.title }}</strong>
    </NuxtLink>

    <Flex y-center gap="s" class="home-event-item__foot" :expand="!inline" :x-between="!inline">
      <Badge v-if="!inline && user" :variant="data.is_official ? 'accent' : 'neutral'" size="s">
        {{ data.is_official ? 'Official' : 'Community' }}
      </Badge>
      <span v-if="inline" class="home-event-item__date">
        <span v-if="isOngoing" class="home-event-item__live-dot" />
        {{ timing }}
      </span>

      <span v-if="inline && rsvpCount > 0" class="home-event-item__count">+{{ rsvpCount }}</span>

      <Flex v-else-if="!inline && showPeople" y-center :gap="4" class="home-event-item__people">
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
  // `.home-item` is sized for a one-line title. This one wraps to two.
  gap: var(--space-xs);
  padding: var(--space-s);

  // Lines up with the forum and games cards across the row
  &:not(.inline) {
    min-height: 108px;
  }
}

.home-event-item__title {
  display: block;
  min-width: 0;
  color: inherit;

  // Covers the item, behind the avatars
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

  .inline & strong {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
    -webkit-line-clamp: unset;
  }

  // Only the tile stacks the date over the title. In a row's foot the margin would knock it off centre.
  .home-event-item__date {
    margin-bottom: var(--space-xxs);
  }
}

.home-event-item__date {
  display: flex;
  align-items: center;
  gap: var(--space-xxs);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  color: var(--color-text-lighter);

  .home-event-item--upcoming & {
    color: var(--color-accent);
  }
}

// Tells ongoing events apart from upcoming ones in the same grid
.home-event-item__live-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: var(--border-radius-pill);
  background-color: var(--color-text-red);
  animation: home-event-live 1.5s ease-in-out infinite;
}

@keyframes home-event-live {
  50% {
    opacity: 0.35;
  }
}

.home-event-item__foot {
  flex-shrink: 0;
  margin-top: auto;
}

.home-event-item__count {
  font-size: var(--font-size-xs);
  color: var(--color-text-lighter);
  white-space: nowrap;
}

// Above the stretched title link, so the avatars still link to profiles
.home-event-item__people {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
}

// Past events keep their avatars grey until hovered, so a wall of avatars
// doesn't pull the eye before the titles do.
.home-event-item:not(.home-event-item--upcoming) .home-event-item__people {
  filter: grayscale(1);
}

.home-event-item:hover .home-event-item__people {
  filter: none;
}
</style>
