<script setup lang="ts">
import type { MetricsHistoryEntry } from '@/composables/useDataMetrics'
import type { TeamSpeakServerSnapshot } from '@/types/teamspeak'
import { Button, Flex, Tooltip } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import constants from '~~/constants.json'
import HomeDashboardCardHeader from '@/components/Home/HomeDashboardCardHeader.vue'
import HomeDashboardPlaceholder from '@/components/Home/HomeDashboardPlaceholder.vue'
import HomeDashboardSection from '@/components/Home/HomeDashboardSection.vue'
import HomeDashboardSkeleton from '@/components/Home/HomeDashboardSkeleton.vue'
import ChartActivityHistogram from '@/components/Shared/Charts/ChartActivityHistogram.vue'
import ChartIrcModal from '@/components/Shared/Charts/ChartIrcModal.vue'
import ChartTeamSpeakOnlineModal from '@/components/Shared/Charts/ChartTeamSpeakOnlineModal.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import { useDataMetrics } from '@/composables/useDataMetrics'
import { useDataTeamSpeakSnapshot } from '@/composables/useDataTeamSpeakSnapshot'
import { useIrcChannelNames } from '@/composables/useIrcChannelNames'
import { useIrcChat } from '@/composables/useIrcChat'
import { isOpaqueIrcChannelKey } from '@/composables/useMetricsAdminIrcChannels'
import { getCSSVariable } from '@/lib/utils/common'
import { getRegionFlagEmoji } from '@/lib/utils/country'

dayjs.extend(relativeTime)

// Chat / Voice card: where the talking is happening right now, in both places
// we host it. Channels come from the metrics snapshot rather than the live IRC
// connection. The chat page opens a socket when you go there, and the dashboard
// should never be the thing that connects you. Secret channels come through
// keyed by a hash of their name, which resolves for the ones you're in and for
// nobody else, so the rest are dropped rather than rendered as a row of hex.

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

const { metrics, fetchMetrics, fetchMetricsHistoryIsolated, getCachedHistory, scheduleRefresh } = useDataMetrics()

// The snapshot says who is in a channel now, the 24h history says whether it
// said anything today. Both seed synchronously from cache, because the fetchers
// are async even on a warm cache and that one render is the difference between
// a returning visitor seeing the card and seeing skeletons.
const cachedDay = getCachedHistory('24h')
const dayHistory = ref<MetricsHistoryEntry[]>(cachedDay ?? [])
const ircReady = ref(metrics.value !== null && cachedDay !== null)

// The snapshot keeps itself current through useDataMetrics for as long as the
// card is mounted. The history is fetched in isolation, so it has to ask.
// Everything drawn from it is folded to the hour, so a new hour is the only
// time it can look different; if another card holds the same window at a
// tighter cadence the entries arrive with that fetch instead.
const HOUR_MS = 60 * 60 * 1000

onMounted(async () => {
  // fetchMetrics rethrows on failure, and a dead snapshot shouldn't leave the
  // card stuck on skeletons, so it's swallowed rather than rejecting the batch.
  const [, day] = await Promise.all([
    fetchMetrics().catch(() => null),
    fetchMetricsHistoryIsolated('24h'),
  ])

  dayHistory.value = day
  ircReady.value = true

  scheduleRefresh('24h', (entries) => {
    dayHistory.value = entries
  }, { cadenceMs: HOUR_MS })
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

// Secret channels arrive under a hash of their name. Being in one is what lets
// you recompute that hash, so your own channels get a name here and everything
// else stays anonymous and drops out.
const { load: loadChannelNames, resolve: resolveChannelName } = useIrcChannelNames()

onMounted(() => {
  void loadChannelNames()
})

function channelName(key: string): string | null {
  if (!isOpaqueIrcChannelKey(key))
    return channelDisplayName(key)

  return resolveChannelName(key)?.name ?? null
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
    .map(key => ({ key, name: channelName(key) }))
    .filter((entry): entry is { key: string, name: string } => entry.name !== null)
    .map(({ key, name }) => ({
      key,
      name,
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
// neither says so rather than printing two zeroes. Half a tile is around twenty
// characters, so messages are abbreviated and the timeframe is left to the
// title: a busy channel spelling out "62 messages today" wrapped to two lines
// and pushed its row out of line with the tile beside it.
function channelActivity(entry: ChannelEntry): string {
  const parts: string[] = []

  if (entry.here > 0)
    parts.push(`${entry.here} user${entry.here === 1 ? '' : 's'}`)

  if (entry.messages > 0)
    parts.push(`${entry.messages} msg${entry.messages === 1 ? '' : 's'}`)

  return parts.length ? parts.join(', ') : 'quiet today'
}

// The abbreviated line on hover, spelled out.
function channelActivityTitle(entry: ChannelEntry): string {
  const parts: string[] = []

  if (entry.here > 0)
    parts.push(`${entry.here} user${entry.here === 1 ? '' : 's'} here now`)

  if (entry.messages > 0)
    parts.push(`${entry.messages} message${entry.messages === 1 ? '' : 's'} today`)

  return parts.length ? parts.join(', ') : 'No messages today'
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
// "is anyone there" and hands you the door. Same five-minute check the viewer
// runs, since without it the count is whatever was true when the page loaded.
const { data: snapshot, status: snapshotStatus } = useDataTeamSpeakSnapshot({
  refreshInterval: 5 * 60 * 1000,
})

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

// Same address the chat menubar's connect guide gives out, for the hover on
// the section label.
const ircAddress = constants.PLATFORMS.IRC.urls.find(url => url.id === 'irc')?.url.replace('irc://', '') ?? 'irc.hivecom.net:6697'

// The legend doubles as the way into the full charts: messages open the IRC
// activity modal, voice opens the TeamSpeak one. Counts feed the modal headers
// and pick the initial period the same way the badges elsewhere do.
const ircModalOpen = ref(false)
const voiceModalOpen = ref(false)

const ircOnline = computed(() => metrics.value?.irc.online ?? null)
const voiceOnline = computed(() => snapshot.value ? voiceServers.value.reduce((sum, server) => sum + server.online, 0) : null)

// The modals draw on canvas, so they get the strip's colours resolved rather
// than as var() references. Empty on the server, where nothing is drawn.
const messagesColor = computed(() => getCSSVariable('--color-text') || undefined)
const voiceColor = computed(() => getCSSVariable('--color-text-blue') || undefined)

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
      <template #action>
        <Tooltip placement="top">
          <Icon name="ph:info" :size="12" class="home-chat__info" />
          <template #tooltip>
            <p class="text-s">
              {{ ircAddress }}
            </p>
          </template>
        </Tooltip>
      </template>

      <div class="home-item-list">
        <button
          v-for="entry in shownChannels"
          :key="entry.key"
          type="button"
          class="home-item home-channel"
          :title="channelActivityTitle(entry)"
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

    <HomeDashboardSkeleton v-if="voiceLoading && !voiceServers.length" variant="rows" :count="1" action />
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
          <button type="button" class="home-activity__legend-item" @click="ircModalOpen = true">
            <i class="home-activity__swatch home-activity__swatch--messages" />Messages
          </button>
          <button type="button" class="home-activity__legend-item" @click="voiceModalOpen = true">
            <i class="home-activity__swatch home-activity__swatch--voice" />In voice
          </button>
        </div>
      </template>

      <ChartActivityHistogram :data="messageBars" :secondary="voiceBars" :height="72" gap="xxs" expand compact class="home-activity">
        <template #tooltip="{ value, secondaryValue, index }">
          <p>{{ hourLabel(index) }}, {{ value }} message{{ value === 1 ? '' : 's' }}, {{ secondaryValue }} in voice</p>
        </template>
      </ChartActivityHistogram>
    </HomeDashboardSection>

    <ChartIrcModal v-model:open="ircModalOpen" :count="ircOnline" :color="messagesColor" />
    <ChartTeamSpeakOnlineModal v-model:open="voiceModalOpen" :count="voiceOnline" :color="voiceColor" />

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

  // Counts have no ceiling, so the abbreviation alone isn't a guarantee. One
  // line per tile, clipped if it comes to that, keeps the row aligned with
  // whatever sits next to it.
  span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
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

.home-chat__info {
  color: var(--color-text-lightest);
}

.home-activity__legend {
  display: flex;
  gap: var(--space-s);
  color: var(--color-text-lighter);
}

// Each entry is a button into its chart, so the button chrome comes off and it
// keeps reading as a legend until hovered.
.home-activity__legend-item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xxs);
  font: inherit;
  font-size: var(--font-size-xxs);
  color: inherit;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    color: var(--color-text);
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
