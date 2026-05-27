<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Badge, Card, Flex, Indicator, Tooltip } from '@dolanske/vui'
import { computed, ref, watchEffect } from 'vue'
import BulkAvatarDisplay from '@/components/Shared/BulkAvatarDisplay.vue'
import GameCover from '@/components/Shared/GameCover.vue'
import GameIcon from '@/components/Shared/GameIcon.vue'
import GlowCard from '@/components/Shared/GlowCard.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{
  game: Tables<'games'>
  rank: number
  recentPlayers: number
  currentPlayerIds: string[]
  serverCount: number
  serverPlayerCount: number
  backgroundUrl: string
  coverUrl: string
  showCurrentPlayers: boolean
}>()

const emit = defineEmits<{
  openServerModal: [game: Tables<'games'>]
  openDetails: [game: Tables<'games'>]
}>()

const isMobile = useBreakpoint('<s')

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
  <GlowCard halo style="cursor: pointer" @click="emit('openDetails', game)">
    <Card class="top-game-hero" :padding="false">
      <div class="top-game-hero__info">
        <Tooltip placement="top">
          <span v-if="isMobile" class="text-xxs text-color-lighter info-text">Most played over 2 weeks</span>
          <Badge v-else variant="neutral" size="s" circle>
            <Icon name="ph:info" size="10" />
          </Badge>
          <template #tooltip>
            <p>Most activity over the last 2 weeks</p>
          </template>
        </Tooltip>
      </div>
      <div
        class="top-game-hero__bg"
        :class="{ 'top-game-hero__bg--loaded': bgLoaded }"
        :style="backgroundUrl
          ? { backgroundImage: `url(${backgroundUrl})` }
          : coverUrl
            ? { backgroundImage: `url(${coverUrl})` }
            : {}"
      />
      <div class="top-game-hero__inner">
        <Flex expand x-between gap="l" :column="isMobile">
          <Flex column gap="s" class="top-game-hero__text">
            <span class="text-xs text-bold text-color-lighter top-game-hero__rank">#{{ rank }}</span>
            <Flex y-center gap="s" class="top-game-hero__name-row">
              <GameIcon :game="game" size="l" />
              <h2 class="text-bold" :class="isMobile ? 'text-xxl' : 'text-xxxxl'">
                {{ game.name }}
              </h2>
            </Flex>
            <span class="text-s text-color-lighter">{{ recentPlayers }} {{ recentPlayers === 1 ? 'person' : 'people' }} at peak</span>
            <Flex class="top-game-hero__bottom" y-center gap="s">
              <Flex v-if="showCurrentPlayers && currentPlayerIds.length > 0" y-center gap="xs">
                <Tooltip placement="top">
                  <Indicator variant="online" outline ripple />
                  <template #tooltip>
                    <p>Playing</p>
                  </template>
                </Tooltip>
                <BulkAvatarDisplay
                  :user-ids="currentPlayerIds"
                  :max-users="8"
                  :avatar-size="22"
                  :gap="-6"
                  :show-names="false"
                  cluster
                  no-empty-state
                  @click.stop
                />
              </Flex>
              <Tooltip v-if="serverCount > 0" placement="top">
                <Badge
                  variant="neutral"
                  size="m"
                  class="server-badge"
                  @click.stop="emit('openServerModal', game)"
                >
                  <Icon name="ph:hard-drives" size="14" />
                  {{ serverCount }}
                </Badge>
                <template #tooltip>
                  <p>
                    {{ serverPlayerCount > 0 ? `${serverPlayerCount} playing on servers` : 'View servers' }}
                  </p>
                </template>
              </Tooltip>
            </Flex>
          </Flex>
          <Flex v-if="!isMobile" y-center class="top-game-hero__cover">
            <GameCover :game="game" size="xl" aspect-ratio="card" :show-fallback="false" />
          </Flex>
        </Flex>
      </div>
    </Card>
  </GlowCard>
</template>

<style lang="scss" scoped>
@use '@/assets/breakpoints.scss' as *;

.top-game-hero {
  position: relative;
  overflow: hidden;
  padding: 0;

  :deep(.vui-card-content) {
    position: relative;
    overflow: hidden;
    height: 100%;
  }

  &__bg {
    position: absolute;
    inset: 0;
    z-index: 0;
    background-size: cover;
    background-position: center;
    opacity: 0;
    filter: blur(4px);
    scale: 1.08;
    pointer-events: none;
    transition: opacity var(--transition-slow);

    &--loaded {
      opacity: 0.18;
    }
  }

  &__inner {
    position: relative;
    z-index: 1;
    isolation: isolate;
    padding: var(--space-xl);
    display: flex;
    min-height: 100%;

    @media screen and (max-width: $breakpoint-s) {
      padding: var(--space-m);
      padding-top: calc(var(--space-m) + 1.4rem); // reserve space for the info text
    }
  }

  &__text {
    flex: 1;
    min-width: 0;
    height: 100%;

    :deep(.bulk-avatar-display__list) {
      justify-content: flex-start;
      margin: 0;
    }
  }

  &__info {
    position: absolute;
    top: var(--space-s);
    right: var(--space-s);
    z-index: 2;
  }

  &__bottom {
    margin-top: auto;
  }

  &__rank {
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  &__name-row {
    &:hover h2 {
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }

  &__cover {
    flex-shrink: 0;
    filter: drop-shadow(0 8px 24px rgba(0, 0, 0, 0.4));
  }
}

.info-text {
  opacity: 0.7;
}

.server-badge {
  cursor: pointer;
}
</style>
