<script setup lang="ts">
import type { RecentlyPlayedGame } from '@/composables/useDataSteamPresences'
import { Flex, PopoutHover, Skeleton } from '@dolanske/vui'
import { defineAsyncComponent } from 'vue'
import HomeDashboardCardHeader from '@/components/Home/HomeDashboardCardHeader.vue'
import HomeDashboardGameItem from '@/components/Home/HomeDashboardGameItem.vue'
import HomeDashboardSection from '@/components/Home/HomeDashboardSection.vue'
import HomeDashboardSkeleton from '@/components/Home/HomeDashboardSkeleton.vue'
import OnlineBadge from '@/components/Shared/OnlineBadge.vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
import { useDataGames } from '@/composables/useDataGames'
import { useDataNotifications } from '@/composables/useDataNotifications'
import { useDataSteamPresences } from '@/composables/useDataSteamPresences'
import { useUserId } from '@/composables/useUserId'
import { fromNow } from '@/lib/utils/date'

const ChartGameActivity = defineAsyncComponent(() => import('@/components/Shared/Charts/ChartGameActivity.vue'))
const ChartActivityHistogramModal = defineAsyncComponent(() => import('@/components/Shared/Charts/ChartActivityHistogramModal.vue'))
const GameDetailsModal = defineAsyncComponent(() => import('@/components/Shared/GameDetailsModal.vue'))

// Games card: my recent games, a short community aggregate, and a couple of
// games I haven't touched that others play. Whoever is in a game right now
// rides along on that game's own row as avatars, so the card never spends a
// section repeating a name it already shows. Friends lead the clusters and pin
// their games to the top. Counts stay small on purpose so this reads as a
// glance rather than a list to work through.

const SHOWN_COMMUNITY = 3
const SHOWN_UNPLAYED = 2

interface CommunityGame extends RecentlyPlayedGame {
  appId: number
  /** Mutual friends in it right now, which is what pins it to the top. */
  friends: number
}

const userId = useUserId()
const { games } = useDataGames()
const { mutualFriendIds } = useDataNotifications()
const {
  currentPlayersBySteamId,
  currentGameByProfileId,
  recentlyPlayedByAppId,
  myRecentApps,
  presencesLoading,
  myRecentAppsLoading,
} = useDataSteamPresences()

// Steam hands us app ids, the details modal wants our own games row, and only
// the games we actually track can bridge the two.
const gameIdBySteamId = computed(() => {
  const map = new Map<number, number>()

  for (const game of games.value) {
    if (game.steam_id != null)
      map.set(game.steam_id, game.id)
  }

  return map
})

function gameIdFor(appId: number): number | null {
  return gameIdBySteamId.value.get(appId) ?? null
}

const detailsGameId = ref<number | null>(null)
const detailsOpen = ref(false)
const activityModalOpen = ref(false)

function openDetails(gameId: number): void {
  detailsGameId.value = gameId
  detailsOpen.value = true
}

// Badge count: everyone the roster has in a game right now, me included.
const playingNow = computed(() => currentGameByProfileId.value.size)
const playingIds = computed(() => [...currentGameByProfileId.value.keys()])

function playersIn(appId: number): string[] {
  return currentPlayersBySteamId.value.get(appId) ?? []
}

// My own tiles drop me from the cluster. I know I play my games, and the row is
// there to say who else showed up.
function othersIn(appId: number): string[] {
  return playersIn(appId).filter(id => id !== userId.value)
}

function friendsIn(appId: number): number {
  return playersIn(appId).filter(id => id !== userId.value && mutualFriendIds.value.includes(id)).length
}

// Friends first, then live players, then headcount, so the top of the list is
// where the people I know actually are rather than where anyone was.
const rankedCommunity = computed<CommunityGame[]>(() =>
  [...recentlyPlayedByAppId.value.entries()]
    .map(([appId, entry]) => ({ appId, ...entry, friends: friendsIn(appId) }))
    .sort((a, b) => {
      if (a.friends !== b.friends)
        return b.friends - a.friends

      if (a.playing !== b.playing)
        return b.playing - a.playing

      return b.count - a.count
    }),
)

// The slice grows to cover every game a friend is in, since dropping a friend
// off the bottom is the one thing this list shouldn't do.
const communityRecent = computed(() => {
  const withFriends = rankedCommunity.value.filter(entry => entry.friends > 0).length

  return rankedCommunity.value.slice(0, Math.max(SHOWN_COMMUNITY, withFriends))
})

// Games the community plays that aren't in my recent list. Anything the
// section above already shows is skipped, since repeating a row twice in one
// card is what made this feel like a wall.
const unplayedByMe = computed(() => {
  const mine = new Set(myRecentApps.value.map(a => a.app_id))
  const shown = new Set(communityRecent.value.map(entry => entry.appId))

  return rankedCommunity.value
    .filter(entry => !mine.has(entry.appId) && !shown.has(entry.appId))
    .slice(0, SHOWN_UNPLAYED)
})

// Right-hand line per row, same shape as the gameservers card. A row with
// people in it right now says so with their avatars, so the count line would
// only repeat them and drops out.
function activityLabel(entry: CommunityGame): string | undefined {
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
      <Skeleton v-if="presencesLoading && !rankedCommunity.length" :height="20" :width="90" :radius="999" />
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

    <HomeDashboardSkeleton v-if="myRecentAppsLoading && !myRecentApps.length" variant="grid" :count="4" />
    <HomeDashboardSection v-else-if="myRecentApps.length" label="Your recent games">
      <div class="home-item-list">
        <HomeDashboardGameItem
          v-for="app in myRecentApps.slice(0, 4)"
          :key="app.app_id"
          :name="String(app.app_name ?? app.app_id)"
          :game-id="gameIdFor(app.app_id)"
          :meta="fromNow(app.last_played_at, Date.now(), 'narrow')"
          :players="othersIn(app.app_id)"
          :friend-ids="mutualFriendIds"
          @open="openDetails"
        />
      </div>
    </HomeDashboardSection>

    <HomeDashboardSkeleton v-if="presencesLoading && !communityRecent.length" variant="rows" :count="SHOWN_COMMUNITY" />
    <HomeDashboardSection v-else-if="communityRecent.length" label="Community plays these">
      <Flex column gap="xs">
        <HomeDashboardGameItem
          v-for="entry in communityRecent"
          :key="entry.appId"
          inline
          :name="String(entry.appName ?? entry.appId)"
          :game-id="gameIdFor(entry.appId)"
          :meta="activityLabel(entry)"
          :players="playersIn(entry.appId)"
          :friend-ids="mutualFriendIds"
          @open="openDetails"
        />
      </Flex>
    </HomeDashboardSection>

    <HomeDashboardSection v-if="unplayedByMe.length" label="You haven't tried these yet">
      <Flex column gap="xs">
        <HomeDashboardGameItem
          v-for="entry in unplayedByMe"
          :key="entry.appId"
          inline
          :name="String(entry.appName ?? entry.appId)"
          :game-id="gameIdFor(entry.appId)"
          :meta="activityLabel(entry)"
          :players="playersIn(entry.appId)"
          :friend-ids="mutualFriendIds"
          @open="openDetails"
        />
      </Flex>
    </HomeDashboardSection>

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
