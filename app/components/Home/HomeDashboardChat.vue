<script setup lang="ts">
import type { MetricsHistoryEntry } from '@/composables/useDataMetrics'
import type { ChannelEntry } from '@/lib/chat/channelActivity'
import type { TeamSpeakServerSnapshot } from '@/types/teamspeak'
import { Button, Flex, Tooltip } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import constants from '~~/constants.json'
import ChatIdentityModal from '@/components/Chat/IdentityModal.vue'
import ChatNativeClientModal from '@/components/Chat/NativeClientModal.vue'
import HomeDashboardCardHeader from '@/components/Home/HomeDashboardCardHeader.vue'
import HomeDashboardChannelsSheet from '@/components/Home/HomeDashboardChannelsSheet.vue'
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
import { channelActivity, channelActivityTitle, channelScore } from '@/lib/chat/channelActivity'
import { useBreakpoint } from '@/lib/mediaQuery'
import { getCSSVariable } from '@/lib/utils/common'
import { getRegionFlagEmoji } from '@/lib/utils/country'

dayjs.extend(relativeTime)

// Channels come from the metrics snapshot, never the live IRC connection: the
// dashboard must not be the thing that connects you.

const SHOWN_CHANNELS = 4

const { metrics, fetchMetrics, fetchMetricsHistoryIsolated, getCachedHistory, scheduleRefresh } = useDataMetrics()

// Seeded synchronously from cache. The fetchers are async even on a warm cache,
// and that one render decides between the card and skeletons.
const cachedDay = getCachedHistory('24h')
const dayHistory = ref<MetricsHistoryEntry[]>(cachedDay ?? [])
const ircReady = ref(metrics.value !== null && cachedDay !== null)

// The isolated history has to ask for refreshes. It's folded to the hour, so
// hourly is the only cadence that can change it.
const HOUR_MS = 60 * 60 * 1000

onMounted(async () => {
  // fetchMetrics rethrows, and a dead snapshot mustn't leave the card on skeletons
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

// Buckets hold per-bucket message counts, so today's total is the sum
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

function channelDisplayName(key: string): string {
  return key.startsWith('#') ? key : `#${key}`
}

// Secret channels arrive as a hash of their name. Only members can recompute
// it, so everyone else's secret channels stay anonymous and drop out.
const { load: loadChannelNames, resolve: resolveChannelName } = useIrcChannelNames()

onMounted(() => {
  void loadChannelNames()
})

function channelName(key: string): string | null {
  if (!isOpaqueIrcChannelKey(key))
    return channelDisplayName(key)

  return resolveChannelName(key)?.name ?? null
}

// Alphabetical tie-break so the tail doesn't reshuffle on every snapshot
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

const channelsSheetOpen = ref(false)

function openChannelsSheet(): void {
  channelsSheetOpen.value = true
}

// Joining is visible to everyone in the channel, so a connected user gets asked first
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

// Without the refresh the count is whatever was true when the page loaded
const { data: snapshot, status: snapshotStatus } = useDataTeamSpeakSnapshot({
  refreshInterval: 5 * 60 * 1000,
})

type ServerConfig = (typeof constants.PLATFORMS.TEAMSPEAK.servers)[number]

function serverConfig(serverId: string): ServerConfig | undefined {
  return constants.PLATFORMS?.TEAMSPEAK?.servers?.find(srv => srv.id === serverId)
}

// Music bots sit in a channel around the clock and would make every server look occupied
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

// The snapshot sits idle for a render before going pending. Both count as not
// landed, or the card flashes its empty state.
const voiceLoading = computed(() =>
  snapshot.value === null && (snapshotStatus.value === 'idle' || snapshotStatus.value === 'pending'),
)

const fallbackConnectUrl = computed(() => constants.PLATFORMS?.TEAMSPEAK?.urls?.[0]?.url ?? null)

const ircAddress = constants.PLATFORMS.IRC.urls.find(url => url.id === 'irc')?.url.replace('irc://', '') ?? 'irc.hivecom.net:6697'

// A button on every size, since touch has no hover for the tooltip. The guide's
// first step points at the identity modal, so that comes along.
const isMobile = useBreakpoint('<s')
const nativeOpen = ref(false)
const identityOpen = ref(false)

function openIdentityFromNative() {
  nativeOpen.value = false
  identityOpen.value = true
}

const ircModalOpen = ref(false)
const voiceModalOpen = ref(false)

const ircOnline = computed(() => metrics.value?.irc.online ?? null)
const voiceOnline = computed(() => snapshot.value ? voiceServers.value.reduce((sum, server) => sum + server.online, 0) : null)

// The modals draw on canvas, so they need resolved colours rather than var() references
const messagesColor = computed(() => getCSSVariable('--color-text') || undefined)
const voiceColor = computed(() => getCSSVariable('--color-text-blue') || undefined)

// Quarter-hour buckets are too many bars for a card, so fold to the hour.
// Messages add up, voice takes the busiest reading.
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

// "3 hours ago (19:00)"
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
    <HomeDashboardSection
      v-else
      label="Chat activity"
      @click="openChannelsSheet"
    >
      <template #action>
        <Tooltip placement="top" :disabled="isMobile">
          <button
            type="button"
            class="home-chat__info"
            aria-label="Connect with an IRC client"
            @click="nativeOpen = true"
          >
            <Icon name="ph:info" :size="12" />
          </button>
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
        <!-- The title's click stretches over the row, so the connect button isn't an anchor in an anchor -->
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

    <HomeDashboardChannelsSheet
      :open="channelsSheetOpen"
      :channels="rankedChannels"
      @close="channelsSheetOpen = false"
      @open="(entry) => { channelsSheetOpen = false; openChannel(entry) }"
    />

    <ChatNativeClientModal :open="nativeOpen" @close="nativeOpen = false" @open-identity="openIdentityFromNative" />
    <ChatIdentityModal :open="identityOpen" @close="identityOpen = false" />

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
// Strips the button chrome off the channel tiles
.home-channel {
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;

  // Counts have no ceiling, so clip to one line to keep the row aligned
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

  // Covers the row, behind the connect button
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

// Fixed height. Filling the leftover space made it a wall when the events card ran long.
.home-activity-section {
  margin-top: auto;
}

// HomeDashboardSection's height: 100% resolves to the whole stretched card, so
// size sections to content here
.dashboard-fill > .dashboard-section {
  height: auto;
}

// Blue for voice keeps it off the accent the dashboard uses for calls to action
.home-activity {
  --histogram-color: var(--color-text);
  --histogram-secondary-color: var(--color-text-blue);

  // Context rather than the point of the card, so it sits back until hovered
  opacity: 0.4;
  transition: opacity var(--transition-duration) ease;

  &:hover {
    opacity: 1;
  }
}

.home-chat__info {
  display: inline-flex;
  align-items: center;
  color: var(--color-text-lightest);
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  transition: color var(--transition-duration) ease;

  &:hover,
  &:focus-visible {
    color: var(--color-text-light);
  }
}

.home-activity__legend {
  display: flex;
  gap: var(--space-s);
  color: var(--color-text-lighter);
}

// Each entry is a button into its chart, styled to read as a legend
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
