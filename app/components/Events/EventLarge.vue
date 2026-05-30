<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Badge, Button, Card, Flex, Tooltip } from '@dolanske/vui'
import BulkAvatarDisplay from '@/components/Shared/BulkAvatarDisplay.vue'
import GlowCard from '@/components/Shared/GlowCard.vue'
import { useEventTiming } from '@/composables/useEventTiming'
import { useBreakpoint } from '@/lib/mediaQuery'
import { humanizeRrule } from '@/lib/utils/rrule'
import CountdownTimer from './CountdownTimer.vue'

const props = defineProps<{
  data: Tables<'events'>
  isOngoing?: boolean
  isHighlight: boolean
}>()

const _emit = defineEmits<{
  open: []
}>()

const countdown = ref({
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
})

function updateTime() {
  const now = new Date()
  const eventDate = new Date(props.data.date)
  const diff = eventDate.getTime() - now.getTime()

  if (diff <= 0) {
    countdown.value = { days: 0, hours: 0, minutes: 0, seconds: 0 }
    return
  }

  countdown.value = {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((diff % (1000 * 60)) / 1000),
  }
}

const isBelowSmall = useBreakpoint('<s')
const isBelowMedium = useBreakpoint('<m')
const { hasEventEnded } = useEventTiming(() => props.data)

useIntervalFn(updateTime, 1000, { immediate: true })
updateTime()

const user = useSupabaseUser()
const supabase = useSupabaseClient()
const rsvpUserIds = ref<string[]>([])
const rsvpCount = ref(0)

onBeforeMount(() => {
  supabase.from('event_rsvps')
    .select('user_id')
    .eq('rsvp', 'yes')
    .eq('event_id', props.data.id)
    .then(({ data }) => {
      const ids = data
        ? Array.from(new Set(data.map(({ user_id }) => user_id)))
        : []
      rsvpCount.value = ids.length
      if (user.value) {
        rsvpUserIds.value = ids
      }
    })
})
</script>

<template>
  <NuxtLink :to="`/events/${data.id}`">
    <GlowCard>
      <Card class="event-large" :class="{ 'event-large--highlight': props.isHighlight }">
        <div class="event-large__container">
          <!-- Left: content -->
          <div class="event-large__content">
            <!-- Title row: title + link button + badge -->
            <Flex x-between y-center gap="xs" :class="isBelowMedium ? 'mb-xl' : 'mb-xs'">
              <strong class="event-large__title" :class="{ 'event-large__title--highlight': props.isHighlight }">
                {{ props.data.title }}
              </strong>
              <Flex gap="xs" y-center shrink="0">
                <Tooltip v-if="props.data.link">
                  <Button
                    square
                    outline
                    plain
                    size="s"
                    target="_blank"
                    rel="noopener noreferrer"
                    :href="props.data.link"
                  >
                    <span class="visually-hidden">Visit Event Link</span>
                    <Icon name="ph:arrow-square-out" size="14" />
                  </Button>
                  <template #tooltip>
                    <p>Visit website</p>
                  </template>
                </Tooltip>
                <Badge :variant="props.data.is_official ? 'accent' : 'neutral'" :filled="!props.data.is_official">
                  {{ props.data.is_official ? 'Official' : 'Community' }}
                </Badge>
              </Flex>
            </Flex>

            <!-- Description -->
            <p class="event-large__description">
              {{ props.data.description }}
            </p>

            <!-- Meta row: attendees left, badges right -->
            <Flex x-between y-center gap="xs">
              <Flex v-if="rsvpCount > 0" x-start class="event-large__people">
                <BulkAvatarDisplay
                  v-if="user"
                  :user-ids="rsvpUserIds"
                  :max-users="6"
                  :avatar-size="isBelowMedium ? (props.isHighlight ? 'l' : 'm') : 's'"
                  :expand="false"
                  :gap="6"
                  cluster
                  :show-names="false"
                />
                <Badge v-else :variant="hasEventEnded ? 'neutral' : 'accent'">
                  <Icon name="ph:users" />
                  {{ rsvpCount }} {{ hasEventEnded ? 'Went' : 'Going' }}
                </Badge>
              </Flex>
              <div v-else />
              <Flex wrap gap="xs" x-end>
                <Badge v-if="props.data.recurrence_rule && !isBelowMedium" variant="neutral">
                  <Icon name="ph:arrows-clockwise" />
                  {{ humanizeRrule(props.data.recurrence_rule) }}
                </Badge>
                <Badge v-if="props.data.location" variant="neutral">
                  <Icon name="ph:map-pin-fill" />
                  {{ props.data.location }}
                </Badge>
                <Tooltip v-if="props.data.note && !isBelowSmall" placement="left">
                  <template #tooltip>
                    <div class="event-large__tooltip-content">
                      {{ props.data.note }}
                    </div>
                  </template>
                  <Badge variant="neutral" class="event-large__note-badge">
                    <Icon name="ph:note" />
                    Note
                  </Badge>
                </Tooltip>
                <Badge v-else-if="props.data.note" variant="neutral">
                  <Icon name="ph:note" />
                  {{ props.data.note }}
                </Badge>
              </Flex>
            </Flex>

            <!-- Countdown on mobile (below content) -->
            <div v-if="isBelowMedium" class="event-large__countdown mt-m">
              <CountdownTimer
                :countdown
                :is-ongoing="props.isOngoing ?? false"
                :created-at="props.data.created_at"
                :simple="!props.isHighlight"
              />
            </div>

            <!-- Recurrence badge below countdown on mobile -->
            <Badge v-if="isBelowMedium && props.data.recurrence_rule" variant="neutral" size="s" class="mt-xs">
              <Icon name="ph:arrows-clockwise" />
              {{ humanizeRrule(props.data.recurrence_rule) }}
            </Badge>
          </div>

          <!-- Right: countdown on desktop -->
          <div v-if="!isBelowMedium" class="event-large__countdown-wrap">
            <CountdownTimer
              :countdown
              :is-ongoing="props.isOngoing ?? false"
              :created-at="props.data.created_at"
              :simple="!props.isHighlight"
            />
          </div>
        </div>
      </Card>
    </GlowCard>
  </NuxtLink>
</template>

<style lang="scss">
@use '@/assets/mixins.scss' as *;
@use '@/assets/breakpoints.scss' as *;

.event-large {
  transition: background-color var(--transition);

  &:hover {
    background-color: var(--color-bg-raised);
  }

  &--highlight {
    background-color: var(--color-bg-raised);

    &:hover {
      background-color: var(--color-border);
    }
  }

  &__container {
    display: grid;
    grid-template-columns: 1fr 420px;
    gap: var(--space-xxl);
    align-items: center;
  }

  &__content {
    display: flex;
    flex-direction: column;
  }

  &__title {
    @include line-clamp(2);
    display: block;
    font-size: var(--font-size-l);
    font-weight: var(--font-weight-bold);
    white-space: normal;
    color: var(--color-text);

    &--highlight {
      font-size: var(--font-size-xxxl);
      font-weight: var(--font-weight-black);
    }
  }

  &__description {
    font-size: var(--font-size-m);
    color: var(--color-text-light);
    text-align: left;
    margin-bottom: var(--space-m);
  }

  &__people {
    transition: filter var(--transition);
  }

  &__countdown-wrap {
    border: 1px solid var(--color-border-strong);
    border-radius: var(--border-radius-m);

    .countdown-timer {
      background-color: var(--color-border-weak);
    }
  }

  &__countdown {
    border: 1px solid var(--color-border-strong);
    border-radius: var(--border-radius-m);

    .countdown-timer {
      background-color: var(--color-border-weak);
    }
  }

  @media (max-width: $breakpoint-m) {
    &__container {
      display: flex;
      flex-direction: column;
      gap: var(--space-l);
    }

    &__title {
      text-align: center;
      -webkit-line-clamp: unset;
      line-clamp: unset;
      display: block;
    }

    &__description {
      text-align: center;
    }

    &__content {
      align-items: center;
      width: 100%;

      // center all nested flex rows (meta badges, people)
      > .vui-flex {
        justify-content: center;
      }

      // title row: stack title above badge on mobile
      > .vui-flex:first-child {
        flex-direction: column;
        align-items: center;
        gap: var(--space-xs);
      }
    }

    &__countdown {
      width: 100%;
      align-self: stretch;

      .countdown-timer {
        width: 100%;
      }
    }
  }

  &__note-badge {
    cursor: help;
  }

  &__tooltip-content {
    max-width: 250px;
    font-size: var(--font-size-xs);
    line-height: 1.4;
  }
}
</style>
