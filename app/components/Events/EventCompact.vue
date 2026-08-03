<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Badge, Card, Divider, Flex, Skeleton } from '@dolanske/vui'
import dayjs from 'dayjs'
import GlowCard from '@/components/Shared/GlowCard.vue'
import { useCache } from '@/composables/useCache'
import { useEventTiming } from '@/composables/useEventTiming'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'
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
const userIds = ref<string[]>([])
const rsvpCount = ref(0)
const loadingRsvps = ref(false)
const supabase = useSupabaseClient()

const _rsvpCache = useCache(CACHE_NAMESPACES.events)

onBeforeMount(async () => {
  const cacheKey = `event-rsvps:${props.data.id}`
  const cached = _rsvpCache.get<string[]>(cacheKey)
  if (cached !== null) {
    rsvpCount.value = cached.length
    if (user.value)
      userIds.value = cached
    return
  }

  loadingRsvps.value = true
  const { data } = await supabase.from('event_rsvps')
    .select('user_id')
    .eq('rsvp', 'yes')
    .eq('event_id', props.data.id)
  loadingRsvps.value = false

  // Deduplicate (should probably be fixed in query)
  const ids = data
    ? Array.from(new Set(data.map(({ user_id }) => user_id)))
    : []
  _rsvpCache.set(cacheKey, ids)
  rsvpCount.value = ids.length
  if (user.value)
    userIds.value = ids
})
</script>

<template>
  <NuxtLink :to="`/events/${props.data.id}`" :draggable="false">
    <GlowCard :no-glow="!!props.noGlow">
      <Card class="event-small-compact" :class="{ upcoming: isUpcoming }">
        <strong class="event-title">
          {{ props.data.title }}
        </strong>
        <Flex x-start y-center>
          <Flex v-if="loadingRsvps" x-start class="event-people">
            <Skeleton :height="28" :width="80" :radius="4" />
          </Flex>
          <Flex v-else-if="rsvpCount > 0" x-start class="event-people" y-center>
            <BulkAvatarDisplay v-if="user" :user-ids :max-users="4" avatar-size="s" :expand="false" :gap="6" cluster />
            <Badge v-else :variant="hasEventEnded ? 'neutral' : 'accent'">
              <Icon name="ph:users" />
              {{ rsvpCount }} {{ hasEventEnded ? 'Went' : 'Going' }}
            </Badge>
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
