<script setup lang="ts">
import type { Database } from '@/types/database.types'
import { Flex } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import HomeDashboardSection from '@/components/Home/HomeDashboardSection.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
import { useDataNotifications } from '@/composables/useDataNotifications'
import { useDataSteamPresences } from '@/composables/useDataSteamPresences'
import { useUserId } from '@/composables/useUserId'

dayjs.extend(relativeTime)

// Raw data pass for the Games card: my recent games with who's in them right
// now, friends playing at this moment, the community aggregate, and games I
// haven't touched that others play.

// Shape of the entries worker-sync-steam writes into presences_steam.recent_apps.
interface RecentApp {
  app_id: number
  app_name: string | null
  last_played_at: string
}

const supabase = useSupabaseClient<Database>()
const userId = useUserId()
const { mutualFriendIds } = useDataNotifications()
const { currentPlayersBySteamId, currentGameByProfileId, recentlyPlayedByAppId } = useDataSteamPresences()

// My own recent apps off my presence row (bounded list, newest first).
const myRecentApps = ref<RecentApp[]>([])

watch(userId, async (uid) => {
  if (uid == null)
    return
  const { data } = await supabase
    .from('presences_steam')
    .select('recent_apps')
    .eq('profile_id', uid)
    .maybeSingle()
  myRecentApps.value = (data?.recent_apps as unknown as RecentApp[] | null) ?? []
}, { immediate: true })

// "You like this game, here's people playing it": first of my recent games
// that someone else is in right now.
const likedGameWithPlayers = computed(() => {
  for (const app of myRecentApps.value) {
    const players = (currentPlayersBySteamId.value.get(app.app_id) ?? []).filter(id => id !== userId.value)
    if (players.length > 0)
      return { app, players }
  }
  return null
})

const friendsPlaying = computed(() =>
  [...currentGameByProfileId.value.entries()]
    .filter(([profileId]) => profileId !== userId.value && mutualFriendIds.value.includes(profileId))
    .map(([profileId, game]) => ({ profileId, game })),
)

const communityRecent = computed(() =>
  [...recentlyPlayedByAppId.value.entries()]
    .map(([appId, entry]) => ({ appId, ...entry }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5),
)

// Games the community plays that aren't in my recent list.
const unplayedByMe = computed(() => {
  const mine = new Set(myRecentApps.value.map(a => a.app_id))
  return [...recentlyPlayedByAppId.value.entries()]
    .filter(([appId]) => !mine.has(appId))
    .map(([appId, entry]) => ({ appId, ...entry }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
})
</script>

<template>
  <Flex column gap="m">
    <HomeDashboardSection v-if="likedGameWithPlayers" label="People playing your game">
      <div class="home-item">
        <strong>{{ likedGameWithPlayers.app.app_name ?? likedGameWithPlayers.app.app_id }}</strong>
        <Flex gap="xs" wrap>
          <UserDisplay v-for="id in likedGameWithPlayers.players" :key="id" :user-id="id" size="s" />
        </Flex>
      </div>
    </HomeDashboardSection>

    <HomeDashboardSection v-if="myRecentApps.length" label="Your recent games">
      <div class="home-item-list">
        <div v-for="app in myRecentApps.slice(0, 4)" :key="app.app_id" class="home-item">
          <strong>{{ app.app_name ?? app.app_id }}</strong>
          <span>{{ dayjs(app.last_played_at).fromNow() }}</span>
        </div>
      </div>
    </HomeDashboardSection>

    <HomeDashboardSection v-if="friendsPlaying.length" label="Friends playing right now">
      <Flex column gap="xs">
        <li v-for="{ profileId, game } in friendsPlaying" :key="profileId" class="home-item inline">
          <UserDisplay :user-id="profileId" size="s" inline />
          <span>{{ game.appName ?? game.appId }}</span>
        </li>
      </Flex>
    </HomeDashboardSection>

    <HomeDashboardSection v-if="communityRecent.length" label="Community plays these">
      <Flex column gap="xs">
        <div v-for="entry in communityRecent" :key="entry.appId" class="home-item inline">
          <strong>{{ entry.appName ?? entry.appId }}</strong>
          <span>{{ entry.count }} player{{ entry.count === 1 ? '' : 's' }}</span>
        </div>
      </Flex>
    </HomeDashboardSection>

    <HomeDashboardSection v-if="unplayedByMe.length" label="You haven't tried these yet">
      <Flex column gap="xs">
        <div v-for="entry in unplayedByMe" :key="entry.appId" class="home-item inline">
          <strong>{{ entry.appName ?? entry.appId }}</strong>
          <span>{{ entry.count }} players{{ entry.count === 1 ? '' : 's' }}</span>
        </div>
      </Flex>
    </HomeDashboardSection>
  </Flex>
</template>
