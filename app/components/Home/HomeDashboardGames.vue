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
  <div>
    <HomeDashboardSection label="You like this game, people are in it now">
      <div v-if="likedGameWithPlayers">
        <strong>{{ likedGameWithPlayers.app.app_name ?? likedGameWithPlayers.app.app_id }}</strong>
        <Flex gap="xs" wrap>
          <UserDisplay v-for="id in likedGameWithPlayers.players" :key="id" :user-id="id" size="s" />
        </Flex>
      </div>
      <p v-else>
        Nobody is in your recent games right now.
      </p>
    </HomeDashboardSection>

    <HomeDashboardSection label="Your recent games">
      <ul v-if="myRecentApps.length">
        <li v-for="app in myRecentApps" :key="app.app_id">
          {{ app.app_name ?? app.app_id }} - {{ dayjs(app.last_played_at).fromNow() }}
        </li>
      </ul>
      <p v-else>
        No recent games on your presence row.
      </p>
    </HomeDashboardSection>

    <HomeDashboardSection label="Friends playing right now">
      <ul v-if="friendsPlaying.length">
        <li v-for="{ profileId, game } in friendsPlaying" :key="profileId">
          <UserDisplay :user-id="profileId" size="s" inline />
          - {{ game.appName ?? game.appId }}
        </li>
      </ul>
      <p v-else>
        No friends in a game right now.
      </p>
    </HomeDashboardSection>

    <HomeDashboardSection label="Community plays these (now or last)">
      <ul v-if="communityRecent.length">
        <li v-for="entry in communityRecent" :key="entry.appId">
          {{ entry.appName ?? entry.appId }} - {{ entry.count }}
        </li>
      </ul>
      <p v-else>
        No presence data.
      </p>
    </HomeDashboardSection>

    <HomeDashboardSection label="You haven't played these recently">
      <ul v-if="unplayedByMe.length">
        <li v-for="entry in unplayedByMe" :key="entry.appId">
          {{ entry.appName ?? entry.appId }} - {{ entry.count }} playing or played last
        </li>
      </ul>
      <p v-else>
        Nothing the community plays that you don't.
      </p>
    </HomeDashboardSection>
  </div>
</template>
