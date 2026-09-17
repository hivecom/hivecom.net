<script setup lang="ts">
import type { SteamRecentApp } from '@/composables/useDataSteamPresences'
import type { Tables } from '@/types/database.overrides'
import { Button, Card, Flex, Sheet, Skeleton, Tooltip } from '@dolanske/vui'
import { computed } from 'vue'
import RecentGameActivityTile from '@/components/Community/Games/RecentGameActivityTile.vue'
import GameArtCard from '@/components/Shared/GameArtCard.vue'
import GameDetailsModalTrigger from '@/components/Shared/GameDetailsModalTrigger.vue'
import GameIcon from '@/components/Shared/GameIcon.vue'
import { useCachedFetch } from '@/composables/useCache'
import { useDataGames } from '@/composables/useDataGames'
import { fromNow } from '@/lib/utils/date'

// What this member has been playing, read off the same presence row the Steam
// activity widget above uses. Only games we track get a slot: everything here
// clicks through to our own details modal, so a Steam app with no row of ours
// would be a dead end.

interface Props {
  profile: Tables<'profiles'>
  isLoggedIn?: boolean
}

const props = defineProps<Props>()

interface RecentGame {
  game: Tables<'games'>
  lastPlayedAt: string
}

const PRESENCE_TTL_MS = 3 * 60 * 1000

// Mirrors RECENT_APPS_MAX in worker-sync-steam, which is what caps the stored
// list. Only the skeleton uses it, so it's the shape the row settles into
// rather than a limit this card enforces.
const SKELETON_ICONS = 8

// RLS keeps presences_steam behind an authenticated role, so a signed-out
// visitor gets the locked state rather than a request that comes back empty and
// reads as "plays nothing".
const canRead = computed(() => Boolean(props.isLoggedIn))

const { games, loading: gamesLoading } = useDataGames()

const { data: presence, initialLoading } = useCachedFetch<{ recent_apps: unknown }>(
  () => ({
    table: 'presences_steam',
    select: 'recent_apps',
    filters: { profile_id: props.profile.id },
    single: true,
  }),
  {
    ttl: PRESENCE_TTL_MS,
    enabled: canRead,
  },
)

const gameBySteamId = computed(() => {
  const map = new Map<number, Tables<'games'>>()

  for (const game of games.value) {
    if (game.steam_id != null)
      map.set(game.steam_id, game)
  }

  return map
})

// The column is jsonb, so the stored shape is never assumed.
const recentApps = computed<SteamRecentApp[]>(() => {
  const value = presence.value?.recent_apps

  if (!Array.isArray(value))
    return []

  return value.filter((entry): entry is SteamRecentApp =>
    entry !== null && typeof entry === 'object' && typeof entry.app_id === 'number',
  )
})

// Already newest-first out of the worker, so the order carries through.
const recentGames = computed<RecentGame[]>(() =>
  recentApps.value.flatMap((app) => {
    const game = gameBySteamId.value.get(app.app_id)

    return game ? [{ game, lastPlayedAt: app.last_played_at }] : []
  }),
)

const loading = computed(() => canRead.value && (initialLoading.value || (gamesLoading.value && !games.value.length)))

const featured = computed(() => recentGames.value[0] ?? null)

const sheetOpen = ref(false)

const emptyStateText = computed(() =>
  `${props.profile.username ?? 'This user'} hasn't played anything we track recently.`,
)
</script>

<template>
  <Card separators class="profile-games card-bg">
    <template #header>
      <Flex x-between y-center>
        <h4>Recently Played</h4>
        <Button
          v-if="!loading && recentGames.length > 1"
          size="s"
          plain
          style="--color-text: var(--color-text-light)"
          @click="sheetOpen = true"
        >
          View all
        </Button>
      </Flex>
    </template>

    <!-- Signed out: the presence table isn't readable, so say that rather than
         showing an empty list. -->
    <Flex v-if="!canRead" column y-center x-center gap="s" class="profile-games__locked">
      <Icon name="ph:lock" size="32" class="text-color-light" />
      <p class="text-color-light text-s text-center">
        Sign in to see what {{ profile.username }} plays.
      </p>
    </Flex>

    <Flex v-else-if="loading" column gap="s">
      <Skeleton width="100%" height="108px" :radius="8" />
      <Flex wrap gap="xs">
        <Skeleton v-for="i in SKELETON_ICONS" :key="i" width="32px" height="32px" :radius="8" />
      </Flex>
    </Flex>

    <Flex v-else-if="featured" column gap="s">
      <GameDetailsModalTrigger v-slot="{ open }" :game-id="featured.game.id">
        <GameArtCard
          :game="featured.game"
          :meta="fromNow(featured.lastPlayedAt)"
          @open="open"
        />
      </GameDetailsModalTrigger>

      <!-- The whole list as icons, lead game included, so the row reads as the
           complete set rather than as leftovers. Names are a hover away and the
           timestamps are one click away, which keeps the card the height of one
           cover instead of growing with the history. -->
      <Flex wrap gap="xs" class="profile-games__icons">
        <GameDetailsModalTrigger
          v-for="entry in recentGames"
          v-slot="{ open }"
          :key="entry.game.id"
          :game-id="entry.game.id"
        >
          <Tooltip position="top">
            <template #tooltip>
              {{ entry.game.name }} - {{ fromNow(entry.lastPlayedAt) }}
            </template>
            <button type="button" class="profile-games__icon" @click="open">
              <GameIcon :game="entry.game" size="m" />
            </button>
          </Tooltip>
        </GameDetailsModalTrigger>
      </Flex>
    </Flex>

    <Flex v-else column y-center x-center class="profile-games__empty">
      <Icon name="ph:game-controller" size="32" class="text-color-light" />
      <p class="text-color-light text-s text-center">
        {{ emptyStateText }}
      </p>
    </Flex>

    <Sheet :open="sheetOpen" :size="456" @close="sheetOpen = false">
      <template #header>
        <h4 class="pt-xxs">
          Recently played by {{ profile.username ?? 'user' }}
        </h4>
      </template>

      <Flex column gap="s" class="pt-s">
        <RecentGameActivityTile
          v-for="entry in recentGames"
          :key="entry.game.id"
          :game="entry.game"
          :live="false"
          :subtitle="fromNow(entry.lastPlayedAt)"
        />
      </Flex>
    </Sheet>
  </Card>
</template>

<style lang="scss" scoped>
.profile-games {
  &__locked {
    padding: var(--space-l) var(--space-m);
  }

  &__empty {
    min-height: 140px;
    gap: var(--space-m);
    text-align: center;

    p {
      margin: 0;
      max-width: 280px;
    }
  }

  // Two levels, so the row recedes until it's being looked at. The card coming
  // under the cursor brings the icons up to full strength, and the one icon
  // under the cursor gets its colour back. Opacity sits on the button rather
  // than the image so GameIcon's own fade-in is left alone.
  &__icon {
    display: flex;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
    opacity: 0.4;
    transition: opacity var(--transition-slow);

    .profile-games:hover & {
      opacity: 1;
    }

    // The shorthand replaces GameIcon's own, so its load fade-in is restated
    // here rather than silently dropped.
    :deep(.game-icon) {
      filter: grayscale(1);
      transition:
        opacity var(--transition-slow),
        filter var(--transition-slow);
    }

    &:hover :deep(.game-icon) {
      filter: grayscale(0);
    }
  }
}
</style>
