<script setup lang="ts">
import type { MetricsHistoryEntry } from '@/composables/useDataMetrics'
import type { TeamSpeakServerSnapshot } from '@/types/teamspeak'
import { Button, Flex } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import constants from '~~/constants.json'
import HomeDashboardCardHeader from '@/components/Home/HomeDashboardCardHeader.vue'
import HomeDashboardPlaceholder from '@/components/Home/HomeDashboardPlaceholder.vue'
import HomeDashboardSection from '@/components/Home/HomeDashboardSection.vue'
import HomeDashboardSkeleton from '@/components/Home/HomeDashboardSkeleton.vue'
import ChartActivityHistogram from '@/components/Shared/Charts/ChartActivityHistogram.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import { useDataMetrics } from '@/composables/useDataMetrics'
import { useDataTeamSpeakSnapshot } from '@/composables/useDataTeamSpeakSnapshot'
import { useIrcChat } from '@/composables/useIrcChat'
import { isOpaqueIrcChannelKey } from '@/composables/useMetricsAdminIrcChannels'
import { getRegionFlagEmoji } from '@/lib/utils/country'

dayjs.extend(relativeTime)

// Chat / Voice card: where the talking is happening right now, in both places
// we host it. Channels come from the metrics snapshot rather than the live IRC
// connection. The chat page opens a socket when you go there, and the dashboard
// should never be the thing that connects you. Secret channels come through
// keyed by an opaque id with no name attached, so they're dropped here instead
// of showing up as a row of UUIDs.

const SHOWN_CHANNELS = 4

// A person in the channel is worth this many messages when ranking. Someone
// sitting there is a reason to join; a burst of messages from an hour ago is
// only evidence that people were.
const USER_WEIGHT = 10

interface ChannelEntry {
  key: string
  name: string
  here: number
  messages: number
}

const { metrics, fetchMetrics, fetchMetricsHistoryIsolated, getCachedHistory } = useDataMetrics()

// The snapshot says who is in a channel now, the 24h history says whether it
// said anything today. Both seed synchronously from cache, because the fetchers
// are async even on a warm cache and that one render is the difference between
// a returning visitor seeing the card and seeing skeletons.
const cachedDay = getCachedHistory('24h')
const dayHistory = ref<MetricsHistoryEntry[]>(cachedDay ?? [])
const ircReady = ref(metrics.value !== null && cachedDay !== null)

onMounted(async () => {
  // fetchMetrics rethrows on failure, and a dead snapshot shouldn't leave the
  // card stuck on skeletons, so it's swallowed rather than rejecting the batch.
  const [, day] = await Promise.all([
    fetchMetrics().catch(() => null),
    fetchMetricsHistoryIsolated('24h'),
  ])

  dayHistory.value = day
  ircReady.value = true
})

// Each bucket carries the messages sent during that bucket, so today's total is
// the sum across the window rather than the last reading.
const messagesToday = computed(() => {
  const totals = new Map<string, number>()

  for (const entry of dayHistory.value) {
    if (!entry.ircMessagesByChannel)
      continue

    for (const [key, count] of Object.entries(entry.ircMessagesByChannel))
      totals.set(key, (totals.get(key) ?? 0) + count)
  }

  return totals
})

// IRC hands names over with their '#', but a key that lost it still has to read
// like a channel.
function channelDisplayName(key: string): string {
  return key.startsWith('#') ? key : `#${key}`
}

function channelScore(entry: ChannelEntry): number {
  return entry.here * USER_WEIGHT + entry.messages
}

// One score per channel, then alphabetical so the tail holds still instead of
// reshuffling every time a snapshot lands.
const rankedChannels = computed<ChannelEntry[]>(() => {
  const here = metrics.value?.irc.byChannel ?? {}
  const keys = new Set([...Object.keys(here), ...messagesToday.value.keys()])

  return [...keys]
    .filter(key => !isOpaqueIrcChannelKey(key))
    .map(key => ({
      key,
      name: channelDisplayName(key),
      here: here[key] ?? 0,
      messages: messagesToday.value.get(key) ?? 0,
    }))
    .sort((a, b) => {
      const scoreDiff = channelScore(b) - channelScore(a)
      if (scoreDiff !== 0)
        return scoreDiff

      return a.name.localeCompare(b.name)
    })
})

const shownChannels = computed(() => rankedChannels.value.slice(0, SHOWN_CHANNELS))

// Second line per channel. Whichever half is zero drops out, and a channel with
// neither says so rather than printing two zeroes.
function channelActivity(entry: ChannelEntry): string {
  const parts: string[] = []

  if (entry.here > 0)
    parts.push(`${entry.here} user${entry.here === 1 ? '' : 's'}`)

  if (entry.messages > 0)
    parts.push(`${entry.messages} message${entry.messages === 1 ? '' : 's'} today`)

  return parts.length ? parts.join(', ') : 'quiet today'
}

// Clicking a channel lands you in it inside the chat sheet, the same way a
// #channel mention does. Already in it: switch to it. Connected but not in it:
// ask first, since joining is visible to everyone in there. Not connected: seed
// the channel so the connect form offers it, and let the sheet take it from there.
const { buffers, isConnected, joinChannel, setActive, seedChannel, chatSheetOpen } = useIrcChat()

const pendingJoin = ref<string | null>(null)
const joinConfirmOpen = ref(false)

function isJoined(name: string): boolean {
  const lower = name.toLowerCase()

  return buffers.value.some(buffer => buffer.kind === 'channel' && buffer.joined && buffer.name.toLowerCase() === lower)
}

function openChannel(entry: ChannelEntry) {
  const name = entry.name

  if (!isConnected.value) {
    seedChannel(name)
    chatSheetOpen.value = true
    return
  }

  if (isJoined(name)) {
    setActive(name)
    chatSheetOpen.value = true
    return
  }

  pendingJoin.value = name
  joinConfirmOpen.value = true
}

function confirmJoin() {
  if (pendingJoin.value)
    joinChannel(pendingJoin.value)

  joinConfirmOpen.value = false
  pendingJoin.value = null
  chatSheetOpen.value = true
}

// Voice servers: one row per server the snapshot reports, with its headcount.
// The viewer on /servers/voiceservers has the channel tree; this only answers
// "is anyone there" and hands you the door.
const { data: snapshot, status: snapshotStatus } = useDataTeamSpeakSnapshot()

type ServerConfig = (typeof constants.PLATFORMS.TEAMSPEAK.servers)[number]

function serverConfig(serverId: string): ServerConfig | undefined {
  return constants.PLATFORMS?.TEAMSPEAK?.servers?.find(srv => srv.id === serverId)
}

// Music bots sit in a channel around the clock, so they'd make every server
// look occupied. Same exclusion the viewer's total makes.
function onlineCount(server: TeamSpeakServerSnapshot): number {
  const botGroup = serverConfig(server.id)?.roleMusicBotGroupId

  return (server.clients ?? []).filter((client) => {
    if (client.uniqueId === 'serveradmin')
      return false

    return botGroup === undefined || !(client.serverGroups ?? []).includes(botGroup)
  }).length
}

interface VoiceServer {
  id: string
  title: string
  flag: string
  online: number
  connectUrl: string | null
}

// Prefer the host and voice port configured for the server, and fall back to
// the first configured URL when the snapshot reports one we have no entry for.
function connectUrl(serverId: string): string | null {
  const matched = serverConfig(serverId)

  if (matched?.queryHost && matched.voicePort)
    return `ts3server://${matched.queryHost}:${matched.voicePort}`

  return constants.PLATFORMS?.TEAMSPEAK?.urls?.[0]?.url ?? null
}

const voiceServers = computed<VoiceServer[]>(() =>
  (snapshot.value?.servers ?? [])
    .map((server) => {
      const config = serverConfig(server.id)

      return {
        id: server.id,
        title: config?.title ?? server.title ?? server.serverInfo?.name ?? server.id,
        flag: getRegionFlagEmoji(config?.region),
        online: onlineCount(server),
        connectUrl: connectUrl(server.id),
      }
    })
    .sort((a, b) => b.online - a.online),
)

// The snapshot only fetches on the client, and the composable kicks it off from
// its own onMounted, so it sits at idle for a render before it even goes
// pending. Both count as "hasn't landed yet", otherwise the card flashes its
// empty state on the way in.
const voiceLoading = computed(() =>
  snapshot.value === null && (snapshotStatus.value === 'idle' || snapshotStatus.value === 'pending'),
)

const fallbackConnectUrl = computed(() => constants.PLATFORMS?.TEAMSPEAK?.urls?.[0]?.url ?? null)

// The last day as two strips of hourly bars, one for messages and one for
// people in voice. The 24h history buckets by quarter hour, which is too many
// bars for a card column, so it's folded to the hour: messages add up, voice
// takes the busiest reading.
interface HourBucket {
  start: number
  messages: number
  voice: number
}

const hourly = computed<HourBucket[]>(() => {
  const byHour = new Map<number, HourBucket>()

  for (const entry of dayHistory.value) {
    const start = dayjs(entry.capturedAt).startOf('hour').valueOf()
    const bucket = byHour.get(start) ?? { start, messages: 0, voice: 0 }

    bucket.messages += entry.ircMessages ?? 0
    bucket.voice = Math.max(bucket.voice, entry.teamspeakOnline ?? 0)
    byHour.set(start, bucket)
  }

  return [...byHour.values()].sort((a, b) => a.start - b.start)
})

const messageBars = computed(() => hourly.value.map(bucket => bucket.messages))
const voiceBars = computed(() => hourly.value.map(bucket => bucket.voice))

// "3 hours ago (19:00)": the distance is what you read, the clock time is
// there to anchor it.
function hourLabel(index: number): string {
  const bucket = hourly.value[index]
  if (!bucket)
    return ''

  const start = dayjs(bucket.start)

  return `${start.fromNow()} (${start.format('HH:mm')})`
}
</script>

<template>
  <Flex column gap="m" class="dashboard-fill">
    <HomeDashboardCardHeader title="Chat / Voice" icon="ph:hash" to="/chat" />

    <HomeDashboardSkeleton v-if="!ircReady && !shownChannels.length" variant="grid" :count="SHOWN_CHANNELS" />
    <HomeDashboardSection v-else label="Chat activity">
      <div class="home-item-list">
        <button
          v-for="entry in shownChannels"
          :key="entry.key"
          type="button"
          class="home-item home-channel"
          @click="openChannel(entry)"
        >
          <strong>{{ entry.name }}</strong>
          <span>{{ channelActivity(entry) }}</span>
        </button>

        <HomeDashboardPlaceholder v-if="!shownChannels.length" full message="Nobody's typing right now.">
          <Button size="s" variant="gray" @click="navigateTo('/chat')">
            Open chat
          </Button>
        </HomeDashboardPlaceholder>
      </div>
    </HomeDashboardSection>

    <HomeDashboardSkeleton v-if="voiceLoading && !voiceServers.length" variant="rows" :count="1" />
    <HomeDashboardSection v-else label="Voice servers" to="/servers/voiceservers">
      <Flex column gap="xs">
        <!-- The title carries the click and stretches over the row, so the
             connect button stays a real link instead of an anchor in an anchor. -->
        <div v-for="server in voiceServers" :key="server.id" class="home-item inline home-voice">
          <NuxtLink to="/servers/voiceservers" class="home-voice__title">
            <span v-if="server.flag" class="home-voice__flag" aria-hidden="true">{{ server.flag }}</span>
            <strong>{{ server.title }}</strong>
          </NuxtLink>

          <Flex y-center gap="s" class="home-voice__side">
            <span>{{ server.online }} online</span>

            <Button
              v-if="server.connectUrl"
              size="s"
              variant="accent"
              plain
              :href="server.connectUrl"
            >
              Connect
            </Button>
          </Flex>
        </div>

        <HomeDashboardPlaceholder v-if="!voiceServers.length" inline message="No voice server reported.">
          <Button
            v-if="fallbackConnectUrl"
            size="s"
            variant="gray"
            :href="fallbackConnectUrl"
          >
            Connect
          </Button>
        </HomeDashboardPlaceholder>
      </Flex>
    </HomeDashboardSection>

    <HomeDashboardSkeleton v-if="!ircReady && !hourly.length" variant="strip" class="home-activity-section" />
    <HomeDashboardSection v-else-if="hourly.length" label="Last 24 hours" class="home-activity-section">
      <template #action>
        <div class="home-activity__legend">
          <span><i class="home-activity__swatch home-activity__swatch--messages" />Messages</span>
          <span><i class="home-activity__swatch home-activity__swatch--voice" />In voice</span>
        </div>
      </template>

      <ChartActivityHistogram :data="messageBars" :secondary="voiceBars" :height="72" gap="xxs" expand compact class="home-activity">
        <template #tooltip="{ value, secondaryValue, index }">
          <p>{{ hourLabel(index) }}, {{ value }} message{{ value === 1 ? '' : 's' }}, {{ secondaryValue }} in voice</p>
        </template>
      </ChartActivityHistogram>
    </HomeDashboardSection>

    <ConfirmModal
      v-model:open="joinConfirmOpen"
      title="Join channel"
      :description="`You're not in ${pendingJoin ?? 'this channel'} yet. Join it?`"
      confirm-text="Join"
      @confirm="confirmJoin"
      @cancel="pendingJoin = null"
    />
  </Flex>
</template>

<style scoped lang="scss">
// The channel tiles are buttons, so the button chrome comes off and the tile
// draws itself the way the other cards' tiles do.
.home-channel {
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.home-voice {
  position: relative;
}

.home-voice__title {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  min-width: 0;
  color: inherit;

  // Click target covers the row, behind the connect button that lifts above it.
  &::after {
    content: '';
    position: absolute;
    inset: 0;
  }
}

.home-voice__flag {
  font-size: var(--font-size-m);
  line-height: 1;
}

.home-voice__side {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
}

// The strip sits on the card's floor at a fixed height. Growing it to fill
// whatever the neighbours leave made it a wall when the events card ran long.
.home-activity-section {
  margin-top: auto;
}

// HomeDashboardSection is `height: 100%`, which is harmless in a card sized by
// its content and wrong the moment the card is stretched: every section
// resolves to the full card and they all shrink from there. Size them to
// content so the labels line up with the cards beside this one.
.dashboard-fill > .dashboard-section {
  height: auto;
}

// Messages in the text colour, voice in VUI's blue: the voice bar is the one that means
// someone is there to talk to, and blue keeps it off the accent the rest of
// the dashboard uses for calls to action.
.home-activity {
  --histogram-color: var(--color-text);
  --histogram-secondary-color: var(--color-text-blue);

  // Background until you look at it. The strip is context, not the point of
  // the card, so it sits back and comes up under the cursor.
  opacity: 0.4;
  transition: opacity var(--transition-duration) ease;

  &:hover {
    opacity: 1;
  }
}

.home-activity__legend {
  display: flex;
  gap: var(--space-s);
  color: var(--color-text-lighter);

  // The size goes on the span itself: VUI's reset sets `span { font-size }`
  // globally, so a size on the wrapper never reaches the text.
  span {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xxs);
    font-size: var(--font-size-xxs);
  }
}

.home-activity__swatch {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: var(--border-radius-pill);

  &--messages {
    background-color: var(--color-text);
  }

  &--voice {
    background-color: var(--color-text-blue);
  }
}
</style>
