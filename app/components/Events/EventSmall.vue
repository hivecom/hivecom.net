<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Badge, Card, Divider, Flex, Skeleton } from '@dolanske/vui'
import dayjs from 'dayjs'
import EventHostAvatar from '@/components/Events/EventHostAvatar.vue'
import GlowCard from '@/components/Shared/GlowCard.vue'
import { useDataEventAttendees } from '@/composables/useDataEventAttendees'
import { useEventOrganizer } from '@/composables/useEventOrganizer'
import { useEventTiming } from '@/composables/useEventTiming'
import { fromNow } from '@/lib/utils/date'
import { truncate } from '@/lib/utils/formatting'
import BulkAvatarDisplay from '../Shared/BulkAvatarDisplay.vue'
import EventGames from './EventGames.vue'

const props = defineProps<{
  data: Tables<'events'>
  noGlow?: boolean
  games?: Tables<'games'>[]
}>()

const isUpcoming = computed(() => {
  return dayjs(props.data.date).isAfter(dayjs())
})

const user = useSupabaseUser()
const { hasEventEnded, isOngoing } = useEventTiming(() => props.data)
const { userIds, count: rsvpCount, loading: loadingRsvps } = useDataEventAttendees(() => props.data.id)

const { organizerId, showOrganizer, attendees } = useEventOrganizer(() => props.data, userIds)

const linkedGames = computed(() => {
  if (!props.games || !props.data.games?.length)
    return []

  return props.data.games
    .map(id => props.games!.find(g => g.id === id))
    .filter((g): g is Tables<'games'> => g != null)
})
</script>

<template>
  <NuxtLink :to="`/events/${props.data.id}`" :draggable="false">
    <GlowCard :no-glow="!!props.noGlow">
      <Card
        class="event-small"
        :class="{
          upcoming: isUpcoming,
          ongoing: isOngoing,
        }"
      >
        <Flex x-between y-center class="mb-m">
          <span class="event-date">
            {{ isOngoing ? 'Ongoing' : fromNow(props.data.date) }}
          </span>
          <Badge v-if="user" :variant="props.data.is_official ? 'accent' : 'neutral'">
            {{ props.data.is_official ? 'Official' : 'Community' }}
          </Badge>
        </Flex>
        <strong class="event-title">
          {{ props.data.title }}
        </strong>
        <p class="event-description">
          {{ truncate(props.data.description, 108) }}
        </p>
        <Flex v-if="loadingRsvps || rsvpCount > 0 || showOrganizer" x-start class="event-people" y-center>
          <Flex y-center :gap="4" class="event-attendees">
            <EventHostAvatar v-if="showOrganizer" :user-id="organizerId!" size="s" />
            <Skeleton v-if="loadingRsvps" :height="28" :width="80" :radius="4" />
            <template v-else>
              <BulkAvatarDisplay v-if="user && attendees.length > 0" :user-ids="attendees" :max-users="4" avatar-size="s" :expand="false" :gap="6" cluster :hide-generic-users="false" />
              <Badge v-else-if="!user && rsvpCount > 0" :variant="hasEventEnded ? 'neutral' : 'accent'">
                <Icon name="ph:users" />
                {{ rsvpCount }} {{ hasEventEnded ? 'Went' : 'Going' }}
              </Badge>
            </template>
          </Flex>

          <template v-if="linkedGames.length > 0">
            <Divider vertical :height="16" />
            <EventGames :games="linkedGames" :show-label="false" :max-visible="4" />
          </template>
        </Flex>
      </Card>
    </GlowCard>
  </NuxtLink>
</template>

<style lang="scss">
@use '@/assets/mixins.scss' as *;
.event-small {
  width: 100%;
  height: 100%;

  & > .vui-card-content {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  &:hover {
    .event-people {
      filter: none;
    }
  }

  &.upcoming,
  &.ongoing {
    .event-date {
      color: var(--color-accent);
    }

    .event-title {
      color: var(--color-text);
    }

    .event-description {
      color: var(--color-text-light);
    }

    .event-people {
      filter: none;
    }
  }

  .event-date {
    display: block;
    text-transform: uppercase;
    font-size: var(--font-size-s);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-lighter);
  }

  .event-people {
    margin-top: var(--space-xs);
    filter: grayscale(1);
  }

  // Host and attendees read as one group, so they sit tighter than the rest of
  // the row.
  .event-attendees {
    flex: 0 0 auto;
  }

  .event-title {
    @include line-clamp(2);
    font-size: var(--font-size-l);
    white-space: normal;
    margin-bottom: var(--space-xs);
    color: var(--color-text-lighter);
  }

  .event-description {
    font-size: var(--font-size-m);
    color: var(--color-text-lightest);
    text-align: left;
    @include line-clamp(2);
    flex: 1;
    margin-bottom: var(--space-xs);
  }
}
</style>
