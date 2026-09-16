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
import BulkAvatarDisplay from '../Shared/BulkAvatarDisplay.vue'

const props = defineProps<{
  data: Tables<'events'>
  noGlow?: boolean
}>()

const isUpcoming = computed(() => {
  return dayjs(props.data.date).isAfter(dayjs())
})

const user = useSupabaseUser()
const { hasEventEnded } = useEventTiming(() => props.data)
const { userIds, count: rsvpCount, loading: loadingRsvps } = useDataEventAttendees(() => props.data.id)

const { organizerId, showOrganizer, attendees } = useEventOrganizer(() => props.data, userIds)
</script>

<template>
  <NuxtLink :to="`/events/${props.data.id}`" :draggable="false">
    <GlowCard :no-glow="!!props.noGlow">
      <Card class="event-small-compact" :class="{ upcoming: isUpcoming }">
        <strong class="event-title">
          {{ props.data.title }}
        </strong>
        <Flex x-start y-center>
          <Flex v-if="loadingRsvps || rsvpCount > 0 || showOrganizer" x-start class="event-people" y-center :gap="4">
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

          <Divider vertical :height="20" />
          <span class="event-date">
            {{ fromNow(props.data.date) }}
          </span>
        </Flex>
      </Card>
    </GlowCard>
  </NuxtLink>
</template>

<style lang="scss">
@use '@/assets/mixins.scss' as *;
.event-small-compact {
  width: 100%;
  height: 100%;

  & > .vui-card-content {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding-block: var(--space-s);
  }

  &:hover {
    .event-people {
      filter: none;
    }
  }

  &.upcoming {
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
    filter: grayscale(1);
  }

  .event-title {
    @include line-clamp(2);
    font-size: var(--font-size-l);
    white-space: normal;
    color: var(--color-text-lighter);
    margin-bottom: var(--space-xs);
  }
}
</style>
