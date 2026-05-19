<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Card, Flex, Grid, Indicator, Skeleton } from '@dolanske/vui'
import { computed } from 'vue'
import BulkAvatarDisplay from '@/components/Shared/BulkAvatarDisplay.vue'
import GameDetailsModalTrigger from '@/components/Shared/GameDetailsModalTrigger.vue'
import GameIcon from '@/components/Shared/GameIcon.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{
  // Map of steam_id (number) -> array of profile_ids currently playing
  currentPlayersBySteamId: Map<number, string[]>
  // Full games list to cross-reference steam_id -> game
  games: Tables<'games'>[]
  // Whether the current user is authenticated
  isLoggedIn: boolean
  // Whether the presences data is still loading
  loading: boolean
}>()

const isMobile = useBreakpoint('<s')

interface NowPlayingEntry {
  game: Tables<'games'>
  playerIds: string[]
}

const nowPlaying = computed<NowPlayingEntry[]>(() => {
  if (!props.isLoggedIn)
    return []

  const entries: NowPlayingEntry[] = []

  for (const [steamId, playerIds] of props.currentPlayersBySteamId) {
    const game = props.games.find(g => g.steam_id === steamId)
    if (game) {
      entries.push({ game, playerIds })
    }
  }

  return entries
    .sort((a, b) => b.playerIds.length - a.playerIds.length)
    .slice(0, 8)
})
</script>

<template>
  <!-- Sign-in CTA for unauthenticated users -->
  <template v-if="!isLoggedIn">
    <Card class="signin-prompt">
      <Flex column gap="l" y-center class="signin-prompt__content">
        <div class="signin-prompt__icon">
          <Icon name="ph:game-controller" size="5rem" />
        </div>
        <h3 class="text-bold text-xxl">
          See Who's Playing
        </h3>
        <p class="text-color-light text-center">
          Sign in to see which games community members are playing right now
        </p>
        <NuxtLink to="/auth/sign-in">
          <Button variant="accent">
            <template #start>
              <Icon name="ph:sign-in" />
            </template>
            Sign In
          </Button>
        </NuxtLink>
      </Flex>
    </Card>
  </template>

  <!-- Loading skeleton -->
  <template v-else-if="loading">
    <Grid :columns="4" gap="m">
      <Skeleton :height="100" :radius="8" />
      <Skeleton :height="100" :radius="8" />
      <Skeleton :height="100" :radius="8" />
      <Skeleton :height="100" :radius="8" />
    </Grid>
  </template>

  <!-- Empty state -->
  <template v-else-if="nowPlaying.length === 0">
    <p class="text-s text-color-lighter">
      Nobody's online in tracked games right now.
    </p>
  </template>

  <!-- Game tiles -->
  <template v-else>
    <Grid :columns="isMobile ? 2 : 4" gap="m">
      <GameDetailsModalTrigger
        v-for="{ game, playerIds } in nowPlaying"
        :key="game.id"
        v-slot="{ open }"
        :game-id="game.id"
      >
        <Card class="now-playing-tile" @click="open">
          <Flex column gap="s" class="now-playing-tile__inner">
            <Flex y-center gap="xs">
              <Indicator variant="online" outline ripple />
              <span class="text-xs text-bold text-color-lighter">
                {{ playerIds.length }} playing
              </span>
            </Flex>
            <Flex y-center gap="xs">
              <GameIcon :game="game" size="s" />
              <span class="text-s text-bold now-playing-tile__name">{{ game.name }}</span>
            </Flex>
            <BulkAvatarDisplay
              :user-ids="playerIds"
              :max-users="5"
              :avatar-size="20"
              :gap="-5"
              :show-names="false"
              cluster
              no-empty-state
            />
          </Flex>
        </Card>
      </GameDetailsModalTrigger>
    </Grid>
  </template>
</template>

<style lang="scss" scoped>
// Sign-in Prompt
.signin-prompt {
  min-height: 200px;
  border: 2px dashed var(--color-border);
  text-align: center;

  &__content {
    padding: var(--space-xl);
  }

  &__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 80px;
    height: 80px;
    border-radius: var(--border-radius-pill);
    background: linear-gradient(135deg, var(--color-accent-weak), var(--color-accent-alpha));
    color: var(--color-accent);
    margin: 0 auto;
  }
}

// Now Playing Tiles
.now-playing-tile {
  cursor: pointer;
  height: 100%;

  :deep(.vui-card-content) {
    height: 100%;
  }

  &:hover {
    background-color: var(--color-bg-raised);
  }
}

.now-playing-tile__inner {
  height: 100%;
}

.now-playing-tile__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
</style>
