<script setup lang="ts">
import type { RecentlyPlayedGame, SteamRecentApp } from '@/composables/useDataSteamPresences'
import type { Tables } from '@/types/database.overrides'
import { Button, Flex, PopoutHover, Skeleton } from '@dolanske/vui'
import { defineAsyncComponent } from 'vue'
import GameRecentlyPlayedSheet from '@/components/Community/Games/GameRecentlyPlayedSheet.vue'
import HomeDashboardCardHeader from '@/components/Home/HomeDashboardCardHeader.vue'
import HomeDashboardGameItem from '@/components/Home/HomeDashboardGameItem.vue'
import HomeDashboardPlaceholder from '@/components/Home/HomeDashboardPlaceholder.vue'
import HomeDashboardSection from '@/components/Home/HomeDashboardSection.vue'
import HomeDashboardSkeleton from '@/components/Home/HomeDashboardSkeleton.vue'
import GameArtCard from '@/components/Shared/GameArtCard.vue'
import OnlineBadge from '@/components/Shared/OnlineBadge.vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
import { useDataGames } from '@/composables/useDataGames'
import { useDataNotifications } from '@/composables/useDataNotifications'
import { useDataSteamPresences } from '@/composables/useDataSteamPresences'
import { useSteamPresenceSetup } from '@/composables/useSteamPresenceSetup'
import { useUserId } from '@/composables/useUserId'
import { fromNow } from '@/lib/utils/date'

const ChartGameActivity = defineAsyncComponent(() => import('@/components/Shared/Charts/ChartGameActivity.vue'))
const ChartActivityHistogramModal = defineAsyncComponent(() => import('@/components/Shared/Charts/ChartActivityHistogramModal.vue'))
const GameDetailsModal = defineAsyncComponent(() => import('@/components/Shared/GameDetailsModal.vue'))

// Live players ride along on their game's row as avatars, so no section repeats
// a name the card already shows. Counts stay small so it reads as a glance.

const SHOWN_RECENT = 2
const SHOWN_COMMUNITY = 3

interface CommunityGame extends RecentlyPlayedGame {
  appId: number
  game: Tables<'games'>
  appName: string
  /** Mutual friends in it right now, which pins it to the top */
  friends: number
}

const userId = useUserId()
const { games, loading: gamesLoading } = useDataGames()
// An empty recent list usually means incomplete setup, so the section says what's missing
const { state: steamSetupState, shortBody: steamSetupBody, buttonLabel: steamSetupLabel } = useSteamPresenceSetup()
const { mutualFriendIds } = useDataNotifications()
const {
  currentPlayersBySteamId,
  currentGameByProfileId,
  recentlyPlayedByAppId,
  myRecentApps,
  presencesLoading,
  myRecentAppsLoading,
} = useDataSteamPresences()

// Both the details modal lookup and the filter that keeps untracked apps off the card
const gameBySteamId = computed(() => {
  const map = new Map<number, Tables<'games'>>()

  for (const game of games.value) {
    if (game.steam_id != null)
      map.set(game.steam_id, game)
  }

  return map
})

function trackedGame(appId: number): Tables<'games'> | null {
  return gameBySteamId.value.get(appId) ?? null
}

interface TrackedRecentApp {
  app: SteamRecentApp
  game: Tables<'games'>
  name: string
}

// Our title wins so a game reads the same as elsewhere on the site
function displayName(game: Tables<'games'>, steamName: string | null, appId: number): string {
  return game.name ?? steamName ?? String(appId)
}

const myTrackedApps = computed<TrackedRecentApp[]>(() =>
  myRecentApps.value
    .flatMap((app) => {
      const game = trackedGame(app.app_id)

      return game ? [{ app, game, name: displayName(game, app.app_name, app.app_id) }] : []
    })
    .slice(0, SHOWN_RECENT),
)

const detailsGameId = ref<number | null>(null)
const detailsOpen = ref(false)
const activityModalOpen = ref(false)
const communitySheetOpen = ref(false)

function openCommunitySheet(): void {
  communitySheetOpen.value = true
}

function openDetails(gameId: number): void {
  detailsGameId.value = gameId
  detailsOpen.value = true
}

// Tracked games only. An untracked app has no row to explain its head in the count.
const playingIds = computed(() =>
  [...currentGameByProfileId.value.entries()]
    .filter(([, game]) => trackedGame(game.appId) !== null)
    .map(([profileId]) => profileId),
)

const playingNow = computed(() => playingIds.value.length)

function playersIn(appId: number): string[] {
  return currentPlayersBySteamId.value.get(appId) ?? []
}

// My own tiles drop me from the cluster
function othersIn(appId: number): string[] {
  return playersIn(appId).filter(id => id !== userId.value)
}

function friendsIn(appId: number): number {
  return playersIn(appId).filter(id => id !== userId.value && mutualFriendIds.value.includes(id)).length
}

const rankedCommunity = computed<CommunityGame[]>(() =>
  [...recentlyPlayedByAppId.value.entries()]
    .flatMap(([appId, entry]) => {
      const game = trackedGame(appId)

      return game
        ? [{ appId, ...entry, game, appName: displayName(game, entry.appName, appId), friends: friendsIn(appId) }]
        : []
    })
    .sort((a, b) => {
      if (a.friends !== b.friends)
        return b.friends - a.friends

      if (a.playing !== b.playing)
        return b.playing - a.playing

      return b.count - a.count
    }),
)

// My own games already have tiles, so the rows below drop them. The sheet keeps
// the full list.
const communityPool = computed(() => {
  const mine = new Set(myTrackedApps.value.map(entry => entry.app.app_id))

  return rankedCommunity.value.filter(entry => !mine.has(entry.appId))
})

// Grows to cover every game a friend is in, so no friend drops off the bottom
const communityRecent = computed(() => {
  const withFriends = communityPool.value.filter(entry => entry.friends > 0).length

  return communityPool.value.slice(0, Math.max(SHOWN_COMMUNITY, withFriends))
})

// Seeded once on mount, so a presence refetch can't swap the pick out from under the cursor
const discoverSeed = ref(0)

onMounted(() => {
  discoverSeed.value = Math.floor(Math.random() * 1000)
})

// Every tracked recent game, not just the two tiles
const myRecentGenres = computed(() => {
  const tags = new Set<string>()

  for (const app of myRecentApps.value) {
    for (const tag of trackedGame(app.app_id)?.genre_tags ?? [])
      tags.add(tag)
  }

  return tags
})

// A catalog game not already on the card. Candidates rank by genre overlap with
// my recent games, and the seed rotates within the top bucket.
const discoverGame = computed<Tables<'games'> | null>(() => {
  const onCard = new Set<number>()

  for (const app of myRecentApps.value) {
    const game = trackedGame(app.app_id)

    if (game)
      onCard.add(game.id)
  }

  for (const entry of communityRecent.value)
    onCard.add(entry.game.id)

  const candidates = games.value.filter(game => !onCard.has(game.id))

  if (!candidates.length)
    return null

  const overlap = (game: Tables<'games'>): number =>
    (game.genre_tags ?? []).filter(tag => myRecentGenres.value.has(tag)).length

  const best = Math.max(...candidates.map(overlap))
  const bucket = candidates.filter(game => overlap(game) === best)

  return bucket[discoverSeed.value % bucket.length] ?? null
})

const discoverActivity = computed<RecentlyPlayedGame | undefined>(() =>
  discoverGame.value?.steam_id != null
    ? recentlyPlayedByAppId.value.get(discoverGame.value.steam_id)
    : undefined,
)

const discoverPlayers = computed(() =>
  discoverGame.value?.steam_id != null ? playersIn(discoverGame.value.steam_id) : [],
)

// Rows with live players show avatars instead, so the count would only repeat them
function activityLabel(entry: RecentlyPlayedGame): string | undefined {
  if (entry.playing > 0)
    return undefined

  const players = `${entry.count} player${entry.count === 1 ? '' : 's'}`

  return entry.lastPlayedAt
    ? `${players}, ${fromNow(entry.lastPlayedAt, Date.now(), 'narrow')}`
    : players
}
</script>

<template>
  <Flex column gap="m">
    <HomeDashboardCardHeader title="Games" icon="ph:game-controller" to="/community/games">
      <Skeleton v-if="(presencesLoading || gamesLoading) && !rankedCommunity.length" :height="20" :width="90" :radius="999" />
      <PopoutHover v-else :disabled="playingNow === 0" placement="bottom-end">
        <template #trigger>
          <OnlineBadge
            :count="playingNow"
            label="Playing"
            size="s"
            clickable
            @click="activityModalOpen = true"
          />
        </template>
        <Flex column gap="xs" class="px-m py-s">
          <UserDisplay
            v-for="id in playingIds"
            :key="id"
            :user-id="id"
            size="s"
            show-profile-preview
          />
        </Flex>
      </PopoutHover>
    </HomeDashboardCardHeader>

    <HomeDashboardSkeleton v-if="(myRecentAppsLoading || gamesLoading) && !myTrackedApps.length" variant="cover" :count="SHOWN_RECENT" />
    <HomeDashboardSection v-else label="Your recent games">
      <div class="home-item-list">
        <GameArtCard
          v-for="{ app, game } in myTrackedApps"
          :key="app.app_id"
          :game="game"
          :meta="fromNow(app.last_played_at, Date.now(), 'narrow')"
          :players="othersIn(app.app_id)"
          :friend-ids="mutualFriendIds"
          @open="openDetails"
        />

        <HomeDashboardPlaceholder
          v-if="!myTrackedApps.length && steamSetupState"
          full
          :message="steamSetupBody"
        >
          <Button size="s" variant="gray" @click="navigateTo('/profile/settings#connections')">
            <template #start>
              <Icon name="ph:steam-logo" />
            </template>
            {{ steamSetupLabel }}
          </Button>
        </HomeDashboardPlaceholder>

        <HomeDashboardPlaceholder v-else-if="!myTrackedApps.length" full message="Nothing played recently." />
      </div>
    </HomeDashboardSection>

    <HomeDashboardSkeleton v-if="(presencesLoading || gamesLoading) && !communityRecent.length" variant="rows" icon :count="SHOWN_COMMUNITY" />
    <HomeDashboardSection
      v-else-if="communityRecent.length"
      label="What everyone's been playing"
      @click="openCommunitySheet"
    >
      <Flex column gap="xs">
        <HomeDashboardGameItem
          v-for="entry in communityRecent"
          :key="entry.appId"
          inline
          :name="entry.appName"
          :game="entry.game"
          :game-id="entry.game.id"
          :meta="activityLabel(entry)"
          :players="playersIn(entry.appId)"
          :friend-ids="mutualFriendIds"
          @open="openDetails"
        />
      </Flex>
    </HomeDashboardSection>

    <HomeDashboardSection v-if="discoverGame" label="Discover something new">
      <HomeDashboardGameItem
        inline
        :name="discoverGame.name ?? discoverGame.shorthand ?? String(discoverGame.id)"
        :game="discoverGame"
        :game-id="discoverGame.id"
        :meta="discoverActivity ? activityLabel(discoverActivity) : undefined"
        :players="discoverPlayers"
        :friend-ids="mutualFriendIds"
        @open="openDetails"
      />
    </HomeDashboardSection>

    <GameRecentlyPlayedSheet
      :open="communitySheetOpen"
      :games="games"
      :current-players-by-steam-id="currentPlayersBySteamId"
      :is-logged-in="!!userId"
      @close="communitySheetOpen = false"
    />

    <ChartActivityHistogramModal
      v-model:open="activityModalOpen"
      title="Game Activity"
      :count="playingNow"
      count-label="Playing"
      count-singular="Playing"
      :series="['usersGameActivity']"
      :initial-period="playingNow ? '24h' : '14d'"
    >
      <template v-if="playingIds.length" #above-chart>
        <Flex expand wrap gap="xs" class="playing-users__grid" y-center x-center>
          <UserAvatar
            v-for="id in playingIds"
            :key="id"
            :user-id="id"
            size="m"
            linked
            show-preview
          />
        </Flex>
      </template>
      <template #default="{ period, window, utc, color }">
        <ChartGameActivity :period :window :utc :color hide-title />
      </template>
    </ChartActivityHistogramModal>

    <GameDetailsModal
      v-model:open="detailsOpen"
      :game-id="detailsGameId"
      @close="detailsOpen = false"
    />
  </Flex>
</template>

<style scoped lang="scss">
.playing-users__grid {
  max-height: 148px;
  overflow-y: auto;
  padding: var(--space-xs);
  background: var(--color-bg-card);
  border-radius: var(--border-radius-m);
}
</style>
