<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Badge, Card, Flex } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import GlowCard from '@/components/Shared/GlowCard.vue'
import { formatTimeAgo } from '@/lib/utils/date.js'
import { truncate } from '@/lib/utils/formatting'
import BulkAvatarDisplay from '../Shared/BulkAvatarDisplay.vue'

// TODO: use subgrid to properly position items

const props = defineProps<{
  data: Tables<'events'>
}>()

dayjs.extend(relativeTime)

const isUpcoming = computed(() => {
  return dayjs(props.data.date).isAfter(dayjs())
})

const userIds = ref<string[]>([])
const supabase = useSupabaseClient()

onBeforeMount(() => {
  supabase.from('event_rsvps')
    .select('user_id')
    .eq('rsvp', 'yes')
    .eq('event_id', props.data.id)
    .then(({ data }) => {
      // Deduplicate (should probably be fixed in query)
      userIds.value = data
        ? Array.from(new Set(data.map(({ user_id }) => user_id)))
        : []
    })
})
</script>

<template>
  <NuxtLink :to="`/events/${props.data.id}`" :draggable="false">
    <GlowCard no-glow>
      <Card class="event-small" :class="{ upcoming: isUpcoming }">
        <Flex x-between y-center class="mb-m">
          <span class="event-date">
            {{ formatTimeAgo(props.data.date) }}
          </span>
          <Badge :variant="props.data.is_official ? 'accent' : 'neutral'">
            {{ props.data.is_official ? 'Official' : 'Community' }}
          </Badge>
        </Flex>
        <strong class="event-title">
          {{ props.data.title }}
        </strong>
        <p class="event-description">
          {{ truncate(props.data.description, 108) }}
        </p>
        <Flex v-if="userIds.length > 0" x-start class="event-people">
          <BulkAvatarDisplay :user-ids :max-users="4" avatar-size="s" :expand="false" :gap="6" cluster />
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
    margin-top: var(--space-xs);
    filter: grayscale(1);
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
  }
}
</style>
