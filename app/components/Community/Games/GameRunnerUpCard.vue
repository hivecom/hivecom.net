<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Badge, Card, Flex, Indicator, Tooltip } from '@dolanske/vui'
import { computed, ref, watchEffect } from 'vue'
import BulkAvatarDisplay from '@/components/Shared/BulkAvatarDisplay.vue'
import GameIcon from '@/components/Shared/GameIcon.vue'
import GlowCard from '@/components/Shared/GlowCard.vue'

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
  <GlowCard role="button" @click="emit('openDetails', game)">
    <Card class="top-game-card" :padding="false">
      <div
        class="top-game-card__bg"
        :class="{ 'top-game-card__bg--loaded': bgLoaded }"
        :style="backgroundUrl
          ? { backgroundImage: `url(${backgroundUrl})` }
          : coverUrl
            ? { backgroundImage: `url(${coverUrl})` }
            : {}"
      />
      <div class="top-game-card__content">
        <span class="text-xs text-bold text-color-lighter top-game-card__rank">#{{ rank }}</span>
        <Flex y-center gap="s" class="top-game-card__name-row">
          <GameIcon :game="game" size="m" />
          <span class="text-xxl text-bold">{{ game.name }}</span>
        </Flex>
        <span class="text-s text-color-lighter">{{ recentPlayers }} {{ recentPlayers === 1 ? 'person' : 'people' }} at peak</span>
        <Flex class="top-game-card__bottom" y-center gap="s">
          <Flex v-if="showCurrentPlayers && currentPlayerIds.length > 0" y-center gap="xs">
            <Tooltip placement="top">
              <Indicator variant="online" outline ripple />
              <template #tooltip>
                <p>Playing</p>
              </template>
            </Tooltip>
            <BulkAvatarDisplay
              :user-ids="currentPlayerIds"
              :max-users="6"
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
              outline
              @click.stop="emit('openServerModal', game)"
            >
              {{ serverCount }}
              Server{{ serverCount > 1 ? 's' : '' }}
            </Badge>
            <template #tooltip>
              <p>
                {{ serverPlayerCount > 0 ? `${serverPlayerCount} playing on servers` : 'View servers' }}
              </p>
            </template>
          </Tooltip>
        </Flex>
      </div>
    </Card>
  </GlowCard>
</template>

<style lang="scss" scoped>
.top-game-card {
  position: relative;
  overflow: hidden;
  padding: 0;
  min-height: 140px;
  height: 100%;

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
    isolation: isolate;
    padding: var(--space-m);
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
    height: 100%;
  }

  &__rank {
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  &__bottom {
    margin-top: auto;
  }
}

.server-badge {
  cursor: pointer;
}
</style>
