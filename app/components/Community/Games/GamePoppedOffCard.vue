<script setup lang="ts">
import type { MetricsHistoryEntry } from '@/composables/useDataMetrics'
import type { Tables } from '@/types/database.overrides'
import { Card, Flex, Skeleton } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { computed } from 'vue'
import GameDetailsModalTrigger from '@/components/Shared/GameDetailsModalTrigger.vue'
import GameIcon from '@/components/Shared/GameIcon.vue'
import GlowCard from '@/components/Shared/GlowCard.vue'

const props = defineProps<{
  // 30d metrics history entries
  metricsHistory30d: MetricsHistoryEntry[]
  // Whether the 30d history is still loading
  loading: boolean
  // All games
  games: Tables<'games'>[]
  // All events
  events: Tables<'events'>[]
  // Pre-resolved background URL for the popped-off game (empty string if none)
  backgroundUrl: string
  // Pre-resolved cover URL for the popped-off game (empty string if none)
  coverUrl: string
}>()

dayjs.extend(relativeTime)

const poppedOff = computed(() => {
  if (!props.metricsHistory30d.length || !props.games.length)
    return null

  // Find entry+gameId with max usersByGame value
  let bestGameId: string | null = null
  let peakCount = 0
  let peakEntry: MetricsHistoryEntry | null = null

  for (const entry of props.metricsHistory30d) {
    if (!entry.usersByGame)
      continue
    for (const [id, count] of Object.entries(entry.usersByGame)) {
      if (count > peakCount) {
        peakCount = count
        bestGameId = id
        peakEntry = entry
      }
    }
  }

  if (!bestGameId || !peakEntry || peakCount < 2)
    return null

  const game = props.games.find(g => String(g.id) === bestGameId)
  if (!game)
    return null

  return { game, peakCount, peakEntry }
})

const linkedEvent = computed(() => {
  if (!poppedOff.value)
    return null
  const peakMs = new Date(poppedOff.value.peakEntry.capturedAt).getTime()
  const SIX_HOURS = 6 * 60 * 60 * 1000
  const gameId = poppedOff.value.game.id

  return props.events.find((e) => {
    if (!e.games?.includes(gameId))
      return false
    const eventStart = new Date(e.date).getTime()
    const durationMs = (e.duration_minutes ?? 120) * 60 * 1000
    const eventEnd = eventStart + durationMs
    return peakMs >= eventStart - SIX_HOURS && peakMs <= eventEnd + SIX_HOURS
  }) ?? null
})

const peakDateLabel = computed(() => {
  if (!poppedOff.value)
    return ''
  return dayjs(poppedOff.value.peakEntry.capturedAt).fromNow()
})
</script>

<template>
  <Skeleton v-if="loading" :height="120" :radius="8" />

  <GlowCard v-if="poppedOff && linkedEvent" halo>
    <NuxtLink :to="`/events/${linkedEvent.id}`" class="popped-off-card__link">
      <Card class="popped-off-card" :padding="false">
        <!-- Background art -->
        <div
          class="popped-off-card__bg"
          :style="backgroundUrl
            ? { backgroundImage: `url(${backgroundUrl})` }
            : coverUrl
              ? { backgroundImage: `url(${coverUrl})` }
              : {}"
        />

        <div class="popped-off-card__content">
          <Flex column gap="xs" class="popped-off-card__left">
            <!-- Label -->
            <span class="text-xs text-bold text-color-lighter popped-off-card__label">
              This recently popped off during an event
            </span>
            <!-- Game identity -->
            <Flex y-center gap="s">
              <GameDetailsModalTrigger v-slot="{ open }" :game-id="poppedOff.game.id">
                <span style="cursor: pointer" @click.prevent.stop="open">
                  <GameIcon :game="poppedOff.game" size="m" />
                </span>
              </GameDetailsModalTrigger>
              <span class="text-xxl text-bold">{{ poppedOff.game.name }}</span>
            </Flex>
            <!-- Peak stat -->
            <Flex y-center x-between gap="s" expand class="mt-xs">
              <Flex y-center gap="xs">
                <Icon name="ph:fire" size="16" class="text-color-lighter" />
                <span class="text-s text-color-lighter">
                  {{ poppedOff.peakCount }} {{ poppedOff.peakCount === 1 ? 'person' : 'people' }} at peak - {{ peakDateLabel }}
                </span>
              </Flex>
              <GlowCard halo>
                <span class="popped-off-card__event-cta">
                  <Icon name="ph:calendar-check" size="18" class="text-color-lighter" />
                  <span class="text-s text-bold">{{ linkedEvent.title }}</span>
                  <Icon name="ph:arrow-right" size="14" class="text-color-lighter popped-off-card__event-cta-arrow" />
                </span>
              </GlowCard>
            </Flex>
          </Flex>
        </div>
      </Card>
    </NuxtLink>
  </GlowCard>
</template>

<style scoped lang="scss">
.popped-off-card {
  position: relative;
  overflow: hidden;
  padding: 0;

  :deep(.vui-card-content) {
    position: relative;
    overflow: hidden;
  }

  &__bg {
    position: absolute;
    inset: 0;
    z-index: 0;
    background-size: cover;
    background-position: center;
    opacity: 0.12;
    filter: blur(3px);
    scale: 1.05;
    pointer-events: none;
  }

  &__content {
    position: relative;
    z-index: 1;
    padding: var(--space-l) var(--space-xl);
    display: flex;
    align-items: center;
    gap: var(--space-l);
  }

  &__left {
    flex: 1;
    min-width: 0;
  }

  &__link {
    display: block;
    color: inherit;
    text-decoration: none;
  }

  &__label {
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  &__event-cta {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-s);
    cursor: default;
  }

  &__event-cta-arrow {
    transition: transform var(--transition);
  }
}
</style>
