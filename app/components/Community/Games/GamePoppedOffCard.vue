<script setup lang="ts">
import type { MetricsHistoryEntry } from '@/composables/useDataMetrics'
import type { Tables } from '@/types/database.overrides'
import { Card, Flex, Skeleton } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { computed, ref, watchEffect } from 'vue'
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
  // True when the linked event is currently ongoing (popping off right now)
  live?: boolean
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

const bgLoaded = ref(false)
const bgUrl = computed(() => props.backgroundUrl || props.coverUrl)

function onBgLoaded() {
  bgLoaded.value = true
}

function preloadBg(url: string) {
  bgLoaded.value = false
  const img = new Image()
  img.onload = onBgLoaded
  img.src = url
}

watchEffect(() => {
  if (bgUrl.value)
    preloadBg(bgUrl.value)
})
</script>

<template>
  <Skeleton v-if="loading" :height="120" :radius="8" />

  <GlowCard v-if="poppedOff && linkedEvent" :halo="true" :class="{ 'popped-off-card--live': props.live }">
    <NuxtLink :to="`/events/${linkedEvent.id}`" class="popped-off-card__link">
      <Card class="popped-off-card" :padding="false">
        <!-- Background art -->
        <div
          class="popped-off-card__bg"
          :class="{ 'popped-off-card__bg--loaded': bgLoaded }"
          :style="backgroundUrl
            ? { backgroundImage: `url(${backgroundUrl})` }
            : coverUrl
              ? { backgroundImage: `url(${coverUrl})` }
              : {}"
        />

        <div class="popped-off-card__content">
          <Flex column gap="xs" class="popped-off-card__left">
            <!-- Label -->
            <span class="text-xs text-bold popped-off-card__label" :class="{ 'popped-off-card__label--live': props.live }">
              <template v-if="props.live">
                <span class="popped-off-card__live-dot" />
                This is popping off right now
              </template>
              <template v-else>
                <span class="popped-off-card__label-desktop">This recently popped off during an event</span>
                <span class="popped-off-card__label-mobile">Recently popped off during an event</span>
              </template>
            </span>
            <!-- Game identity -->
            <Flex y-center gap="s" class="popped-off-card__game-row">
              <GameDetailsModalTrigger v-slot="{ open }" :game-id="poppedOff.game.id">
                <span class="popped-off-card__icon-trigger" @click.prevent.stop="open">
                  <GameIcon :game="poppedOff.game" size="m" />
                </span>
              </GameDetailsModalTrigger>
              <span class="text-xxl text-bold popped-off-card__game-name">{{ poppedOff.game.name }}</span>
            </Flex>
            <!-- Peak stat -->
            <div class="popped-off-card__bottom mt-xs">
              <Flex y-center gap="xs" class="popped-off-card__peak">
                <Icon name="ph:fire" size="16" class="text-color-lighter" />
                <span class="text-s text-color-lighter">
                  {{ poppedOff.peakCount }} {{ poppedOff.peakCount === 1 ? 'person' : 'people' }} at peak - {{ peakDateLabel }}
                </span>
              </Flex>
              <GlowCard halo class="popped-off-card__cta-wrap">
                <span class="popped-off-card__event-cta">
                  <Icon name="ph:calendar-check" size="18" class="text-color-lighter" />
                  <span class="text-s text-bold popped-off-card__event-title">{{ linkedEvent.title }}</span>
                  <Icon name="ph:arrow-right" size="14" class="text-color-lighter popped-off-card__event-cta-arrow" />
                </span>
              </GlowCard>
            </div>
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
    opacity: 0;
    filter: blur(3px);
    scale: 1.05;
    pointer-events: none;
    transition: opacity var(--transition-slow);

    &--loaded {
      opacity: 0.12;
    }
  }

  &__content {
    position: relative;
    z-index: 1;
    padding: var(--space-l) var(--space-xl);
    display: flex;
    align-items: center;
    gap: var(--space-l);

    @media (max-width: 480px) {
      padding: var(--space-m) var(--space-l) var(--space-l);
      justify-content: center;
      text-align: center;
    }
  }

  &__game-row {
    @media (max-width: 480px) {
      order: -1;
      justify-content: center;
    }
  }

  &__left {
    flex: 1;
    min-width: 0;

    @media (max-width: 480px) {
      align-items: center;
      width: 100%;
      gap: var(--space-l);
    }
  }

  &__label-desktop {
    @media (max-width: 480px) {
      display: none;
    }
  }

  &__label-mobile {
    display: none;

    @media (max-width: 480px) {
      display: inline;
    }
  }

  &__link {
    display: block;
    color: inherit;
    text-decoration: none;
  }

  &__icon-trigger {
    cursor: pointer;
  }

  &__game-name {
    @media (max-width: 480px) {
      font-size: var(--font-size-xl);
    }
  }

  &__label {
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-lighter);
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);

    &--live {
      color: var(--color-accent);
    }

    @media (max-width: 480px) {
      font-size: var(--font-size-l);
      letter-spacing: 0.08em;
    }
  }

  &__live-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    background-color: var(--color-text-red);
    border-radius: var(--border-radius-pill);
    animation: shimmer 2s linear infinite;
  }

  &__bottom {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-s);
    flex-wrap: wrap;

    @media (max-width: 480px) {
      flex-direction: column;
      align-items: stretch;
      gap: var(--space-xs);
    }
  }

  &__peak {
    flex-shrink: 0;

    @media (max-width: 480px) {
      justify-content: center;
    }
  }

  &__cta-wrap {
    flex-shrink: 1;
    min-width: 0;

    @media (max-width: 480px) {
      width: 100%;
    }
  }

  &__event-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 160px;
  }

  &__event-cta {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-s);
    cursor: default;

    @media (max-width: 480px) {
      justify-content: center;
      width: 100%;
    }
  }

  &__event-cta-arrow {
    transition: transform var(--transition);
  }
}
</style>
