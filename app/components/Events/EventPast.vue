<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Card, Flex } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { truncate } from '@/lib/utils/formatting'
import EventRSVPCount from './EventRSVPCount.vue'

const props = defineProps<{
  data: Tables<'events'>
}>()

dayjs.extend(relativeTime)

const countEl = useTemplateRef('countRef')
const count = computed(() => countEl.value?.count ?? 0)
</script>

<template>
  <NuxtLink :to="`/events/${props.data.id}`">
    <Card class="event-past">
      <Flex column gap="xs" expand class="event-past__wrapper">
        <strong class="event-past__title">
          {{ props.data.title }}
        </strong>
        <p class="event-past__description">
          {{ truncate(props.data.description, 108) }}
        </p>

        <Flex gap="l" y-center>
          <Flex y-center gap="xs" class="event-past__details">
            <Icon name="ph:calendar" size="18" />
            {{ dayjs(props.data.date).fromNow() }}
          </Flex>

          <Flex v-if="count" y-center gap="xs" class="event-past__details">
            <Icon name="ph:user" size="18" />
            {{ count }} attendee{{ count === 1 ? '' : 's' }}
          </Flex>
        </Flex>
      </Flex>
    </Card>
  </NuxtLink>

  <EventRSVPCount
    ref="countRef"
    style="display:none"
    :event="props.data"
    size="s"
    show-when-zero
  />
</template>

<style lang="scss">
.event-past {
  width: 328px;
  min-width: 328px;

  &:hover {
    background-color: var(--color-bg-raised);
  }

  &__wrapper {
    height: 144px;
  }

  &__title {
    display: block;
    font-size: var(--font-size-l);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__description {
    font-size: var(--font-size-m);
    color: var(--color-text-lighter);
    flex: 1;
  }

  &__details {
    font-size: var(--font-size-s);
    color: var(--color-text-light);
  }
}
</style>
