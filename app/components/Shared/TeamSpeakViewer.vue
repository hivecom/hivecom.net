<script setup lang="ts">
import type { TeamSpeakIdentityRecord, TeamSpeakNormalizedChannel, TeamSpeakServerSnapshot, TeamSpeakSnapshot } from '@/types/teamspeak'
import { Alert, Badge, Button, Card, Flex, Grid, Select, Skeleton, Switch, Tooltip } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import constants from '~~/constants.json'
import ErrorAlert from '@/components/Shared/ErrorAlert.vue'
import RoleIndicator from '@/components/Shared/RoleIndicator.vue'
import UserLink from '@/components/Shared/UserLink.vue'
import { useTeamSpeakSnapshot } from '@/composables/useTeamSpeakSnapshot'
import { useBreakpoint } from '@/lib/mediaQuery'
import { getCountryEmoji } from '@/lib/utils/country'
import BadgeCircle from './BadgeCircle.vue'
import TimestampDate from './TimestampDate.vue'

const props = withDefaults(defineProps<Props>(), {
  refreshInterval: 5 * 60 * 1000,
  servers: null,
})

const isBelowLarge = useBreakpoint('<l')

type ClientRole = 'admin' | 'moderator' | 'supporter' | 'registered' | 'music-bot'

interface SelectOption {
  label: string
  value: string
}

interface Props {
  refreshInterval?: number
  /** Optional explicit server data for embedding/testing. */
  servers?: TeamSpeakServerSnapshot[] | null
  /** Optional specific server id to force selection and hide the server picker. */
  serverId?: string | null
}

const SNAPSHOT_BUCKET = 'hivecom-content-static'
const SNAPSHOT_PATH = 'teamspeak/state.json'

const MOCK_SNAPSHOT: TeamSpeakSnapshot = {
  collectedAt: new Date().toISOString(),
  servers: [
    {
      id: 'eu',
      title: 'Mock Server',
      collectedAt: new Date().toISOString(),
      serverInfo: {
        name: 'Mock Instance',
        platform: 'Linux',
        version: '3.13.7',
        uptimeSeconds: 12_345,
        maxClients: 32,
        totalClients: 2,
        totalChannels: 4,
      },
      channels: [
        {
          id: '1',
          parentId: '0',
          order: 0,
          name: 'Lobby',
          totalClients: 1,
          requiredTalkPower: 0,
          moderated: false,
          muted: false,
          depth: 0,
          path: ['Lobby'],
          children: [],
          clients: [
            {
              uniqueId: 'uniqueid1=',
              databaseId: '1',
              nickname: 'MockUser',
              channelId: '1',
              channelName: 'Lobby',
              channelPath: ['Lobby'],
              serverGroups: [],
              away: false,
              muted: false,
              inputMuted: false,
              outputMuted: false,
              talkPower: 0,
              channelRequiredTalkPower: 0,
              channelModerated: false,
              channelMuted: false,
              country: 'DE',
            },
          ],
        },
        {
          id: '2',
          parentId: '0',
          order: 1,
          name: '[spacer0]Games',
          totalClients: 0,
          requiredTalkPower: 0,
          moderated: false,
          muted: false,
          depth: 0,
          path: ['[spacer0]Games'],
          children: [
            {
              id: '3',
              parentId: '2',
              order: 0,
              name: 'General',
              totalClients: 1,
              requiredTalkPower: 50,
              moderated: true,
              muted: false,
              depth: 1,
              path: ['[spacer0]Games', 'General'],
              children: [],
              clients: [
                {
                  uniqueId: 'uniqueid2=',
                  databaseId: '2',
                  nickname: 'Gamer',
                  channelId: '3',
                  channelName: 'General',
                  channelPath: ['[spacer0]Games', 'General'],
                  serverGroups: [],
                  away: true,
                  muted: false,
                  inputMuted: true,
                  outputMuted: false,
                  talkPower: 10,
                  channelRequiredTalkPower: 50,
                  channelModerated: true,
                  channelMuted: true,
                  country: 'US',
                },
              ],
            },
          ],
          clients: [],
        },
      ],
      clients: [],
    },
    {
      id: 'na',
      title: 'Mock Server NA',
      collectedAt: new Date().toISOString(),
      serverInfo: {
        name: 'Mock Instance NA',
        platform: 'Linux',
        version: '3.13.7',
        uptimeSeconds: 98_765,
        maxClients: 64,
        totalClients: 3,
        totalChannels: 3,
      },
      channels: [
        {
          id: '10',
          parentId: '0',
          order: 0,
          name: 'Lobby',
          totalClients: 1,
          requiredTalkPower: 0,
          moderated: false,
          muted: false,
          depth: 0,
          path: ['Lobby'],
          children: [],
          clients: [
            {
              uniqueId: 'uniqueid3=',
              databaseId: '3',
              nickname: 'Andy',
              channelId: '10',
              channelName: 'Lobby',
              channelPath: ['Lobby'],
              serverGroups: [12],
              away: false,
              muted: false,
              inputMuted: false,
              outputMuted: false,
              talkPower: 0,
              channelRequiredTalkPower: 0,
              channelModerated: false,
              channelMuted: false,
              country: 'CA',
            },
          ],
        },
        {
          id: '11',
          parentId: '0',
          order: 1,
          name: '[spacer0]Rooms',
          totalClients: 0,
          requiredTalkPower: 0,
          moderated: false,
          muted: false,
          depth: 0,
          path: ['[spacer0]Rooms'],
          children: [
            {
              id: '12',
              parentId: '11',
              order: 0,
              name: 'Strategy',
              totalClients: 2,
              requiredTalkPower: 120,
              moderated: true,
              muted: true,
              depth: 1,
              path: ['[spacer0]Rooms', 'Strategy'],
              children: [],
              clients: [
                {
                  uniqueId: 'uniqueid4=',
                  databaseId: '4',
                  nickname: 'EvilAndy',
                  channelId: '12',
                  channelName: 'Strategy',
                  channelPath: ['[spacer0]Rooms', 'Strategy'],
                  serverGroups: [13],
                  away: false,
                  muted: true,
                  inputMuted: true,
                  outputMuted: false,
                  talkPower: 10,
                  channelRequiredTalkPower: 120,
                  channelModerated: true,
                  channelMuted: true,
                  country: 'GB',
                },
                {
                  uniqueId: 'uniqueid5=',
                  databaseId: '5',
                  nickname: 'Scout',
                  channelId: '12',
                  channelName: 'Strategy',
                  channelPath: ['[spacer0]Rooms', 'Strategy'],
                  serverGroups: [14],
                  away: true,
                  muted: false,
                  inputMuted: false,
                  outputMuted: false,
                  talkPower: 200,
                  channelRequiredTalkPower: 120,
                  channelModerated: true,
                  channelMuted: false,
                  country: 'US',
                },
              ],
            },
          ],
          clients: [],
        },
      ],
      clients: [],
    },
  ],
}

const { data, pending, error, refresh, lastUpdated } = useTeamSpeakSnapshot({
  refreshInterval: props.refreshInterval,
})

const manualRefreshPending = ref(false)

const canRefresh = computed(() => {
  const raw = lastUpdated.value
  if (!raw)
    return true

  const parsed = Date.parse(raw)
  if (Number.isNaN(parsed))
    return true

  return Date.now() - parsed >= 60_000
})

async function handleRefresh() {
  if (manualRefreshPending.value)
    return

  manualRefreshPending.value = true
  try {
    await refresh()
  }
  finally {
    manualRefreshPending.value = false
  }
}

const selectedServerId = ref<string | null>(props.serverId ?? null)
const showMusicBots = ref(false)

// Fetch users with TeamSpeak identities to enable UserLink
const supabase = useSupabaseClient()
const rawSnapshotUrl = computed<string | null>(() => {
  const { data: publicUrlData } = supabase.storage
    .from(SNAPSHOT_BUCKET)
    .getPublicUrl(SNAPSHOT_PATH)

  const publicUrl = publicUrlData?.publicUrl
  if (!publicUrl)
    return null

  const token = props.refreshInterval && Number.isFinite(props.refreshInterval)
    ? Math.floor(Date.now() / props.refreshInterval)
    : Date.now()
  const url = new URL(publicUrl)
  url.searchParams.set('t', String(token))
  return url.toString()
})

const { data: teamspeakUsers } = await useAsyncData(
  'teamspeak-users',
  async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, teamspeak_identities')
      .not('teamspeak_identities', 'is', null)

    if (error) {
      console.error('Failed to fetch TeamSpeak users:', error)
      return []
    }

    return data ?? []
  },
  {
    default: () => [],
  },
)

// Create a map of TeamSpeak uniqueId -> user ID for quick lookups
const teamspeakToUserId = computed<Map<string, string>>(() => {
  const map = new Map<string, string>()

  teamspeakUsers.value?.forEach((profile) => {
    if (!profile.teamspeak_identities || !Array.isArray(profile.teamspeak_identities))
      return

    profile.teamspeak_identities.forEach((identity: unknown) => {
      if (!identity || typeof identity !== 'object')
        return

      const record = identity as TeamSpeakIdentityRecord
      if (record.uniqueId && record.serverId) {
        // Use a composite key: serverId:uniqueId
        map.set(`${record.serverId}:${record.uniqueId}`, profile.id)
      }
    })
  })

  return map
})

// Helper to get user ID for a TeamSpeak client
function getUserIdForClient(serverId: string, uniqueId: string): string | null {
  return teamspeakToUserId.value.get(`${serverId}:${uniqueId}`) ?? null
}

const platformTitle = computed(() => constants.PLATFORMS?.TEAMSPEAK?.title ?? 'TeamSpeak')
const snapshotServers = computed(() => (data.value as TeamSpeakSnapshot | null)?.servers ?? [])
const servers = computed<TeamSpeakServerSnapshot[]>(() => {
  if (props.servers && props.servers.length)
    return props.servers

  if (snapshotServers.value.length)
    return snapshotServers.value

  if (process.env.NODE_ENV === 'development')
    return MOCK_SNAPSHOT.servers

  return []
})

const serversSorted = computed(() =>
  [...servers.value].sort((a: TeamSpeakServerSnapshot, b: TeamSpeakServerSnapshot) => {
    const aLabel = a.title ?? a.serverInfo?.name ?? a.id
    const bLabel = b.title ?? b.serverInfo?.name ?? b.id
    return aLabel.localeCompare(bLabel)
  }),
)

watch(serversSorted, (next) => {
  if (props.serverId)
    return

  if (!selectedServerId.value && (next?.length ?? 0) > 0)
    selectedServerId.value = next[0]!.id
}, { immediate: true })

const serverOptions = computed(() =>
  serversSorted.value.map(server => ({
    label: formatServerLabel(server),
    value: server.id,
  })),
)

const selectedServer = computed(() => {
  if (serversSorted.value.length === 0)
    return null
  if (serversSorted.value.length === 1)
    return serversSorted.value[0]
  if (props.serverId)
    return serversSorted.value.find(s => s.id === props.serverId) ?? serversSorted.value[0]
  if (!selectedServerId.value)
    return serversSorted.value[0]
  return serversSorted.value.find(s => s.id === selectedServerId.value) ?? serversSorted.value[0]
})

const teamspeakConnectUrl = computed<string | null>(() => {
  const targetServer = selectedServer.value
  if (!targetServer)
    return null

  // Prefer configured URL for matching server id
  const serversCfg = constants.PLATFORMS?.TEAMSPEAK?.servers ?? []
  const matched = serversCfg.find(srv => srv.id === targetServer.id)
  if (matched?.voicePort && matched.queryHost) {
    const host = matched.queryHost
    const port = matched.voicePort
    return `ts3server://${host}:${port}`
  }

  // Fallback to first configured URL
  const urls = constants.PLATFORMS?.TEAMSPEAK?.urls ?? []
  const firstUrl = urls[0]?.url
  return firstUrl ?? null
})

const serverSelectModel = computed<SelectOption[] | undefined>({
  get() {
    if (props.serverId)
      return serverOptions.value.filter(option => option.value === props.serverId)
    if (!selectedServerId.value)
      return undefined
    const selection = serverOptions.value.find(option => option.value === selectedServerId.value)
    return selection ? [selection] : undefined
  },
  set(value) {
    if (props.serverId)
      return
    const next = value?.[0]?.value ?? serversSorted.value[0]?.id ?? null
    selectedServerId.value = next
  },
})

const serverRoleMap = computed<Record<string, { admin?: number, moderator?: number, supporter?: number, registered?: number, musicBot?: number }>>(() => {
  const map: Record<string, { admin?: number, moderator?: number, supporter?: number, registered?: number, musicBot?: number }> = {}
  const serversCfg = constants.PLATFORMS?.TEAMSPEAK?.servers ?? []
  serversCfg.forEach((srv) => {
    map[srv.id] = {
      admin: srv.roleAdminGroupId,
      moderator: srv.roleModeratorGroupId,
      supporter: srv.roleSupporterGroupId,
      registered: srv.roleRegisteredGroupId,
      musicBot: srv.roleMusicBotGroupId,
    }
  })
  return map
})

const channelRowsByServer = computed<Record<string, TeamSpeakNormalizedChannel[]>>(() => {
  const map: Record<string, TeamSpeakNormalizedChannel[]> = {}
  servers.value.forEach((server: TeamSpeakServerSnapshot) => {
    map[server.id] = flattenChannels(server.channels)
  })
  return map
})

const clientsByServerChannel = computed<Record<string, Map<string, TeamSpeakServerSnapshot['clients']>>>(() => {
  const map: Record<string, Map<string, TeamSpeakServerSnapshot['clients']>> = {}

  servers.value.forEach((server: TeamSpeakServerSnapshot) => {
    const channelMap = new Map<string, TeamSpeakServerSnapshot['clients']>()

    ;(server.clients ?? []).forEach((client) => {
      if (client.uniqueId === 'serveradmin')
        return
      const channelKey = client.channelId ?? '__unassigned__'
      const existing = channelMap.get(channelKey) ?? []
      existing.push(client)
      channelMap.set(channelKey, existing)
    })

    map[server.id] = channelMap
  })

  return map
})

const errorMessage = computed(() => {
  if (servers.value.length)
    return ''

  if (!error.value)
    return ''

  if (typeof error.value === 'string')
    return error.value

  if (error.value instanceof Error)
    return error.value.message

  if (typeof (error.value as { message?: unknown }).message === 'string')
    return (error.value as { message: string }).message

  return 'Unable to load TeamSpeak status.'
})

function formatDuration(seconds?: number): string {
  if (seconds === undefined || !Number.isFinite(seconds))
    return '—'

  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)

  if (days > 0)
    return `${days}d ${hours}h`
  if (hours > 0)
    return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function flattenChannels(tree: TeamSpeakNormalizedChannel[]): TeamSpeakNormalizedChannel[] {
  const rows: TeamSpeakNormalizedChannel[] = []

  const walk = (nodes: TeamSpeakNormalizedChannel[]) => {
    nodes.forEach((node) => {
      rows.push(node)
      if (node.children?.length)
        walk(node.children)
    })
  }

  walk(tree)
  return rows
}

function formatServerLabel(server: TeamSpeakServerSnapshot): string {
  return server.serverInfo?.name ?? server.title ?? server.id.toUpperCase()
}

function displayChannelName(channel: TeamSpeakNormalizedChannel): { label: string, isSpacer: boolean } {
  const raw = channel.name ?? ''
  const stripped = raw.replace(/^\[l?spacer\d*\]\s*/i, '')
  const withoutParens = stripped.replace(/^\((.*)\)$/u, '$1').trim()
  const label = withoutParens.length ? withoutParens : raw
  const isSpacer = /^\[l?spacer\d*\]/i.test(raw)
  return { label, isSpacer }
}

function clientRole(serverId: string, client: TeamSpeakServerSnapshot['clients'][number]): ClientRole | null {
  const roles = serverRoleMap.value[serverId]
  if (!roles)
    return null

  const groups = client.serverGroups ?? []
  if (roles.musicBot && groups.includes(roles.musicBot))
    return 'music-bot'
  if (roles.admin && groups.includes(roles.admin))
    return 'admin'
  if (roles.moderator && groups.includes(roles.moderator))
    return 'moderator'
  if (roles.registered && groups.includes(roles.registered))
    return 'registered'
  return null
}

function isMusicBot(serverId: string, client: TeamSpeakServerSnapshot['clients'][number]): boolean {
  const roles = serverRoleMap.value[serverId]
  if (!roles?.musicBot)
    return false
  return (client.serverGroups ?? []).includes(roles.musicBot)
}

function isPokeChannel(channel: TeamSpeakNormalizedChannel): boolean {
  return channel.name?.toLowerCase().includes('poke') ?? false
}

function sortClients(serverId: string, clients: TeamSpeakServerSnapshot['clients']): TeamSpeakServerSnapshot['clients'] {
  const priority = (client: TeamSpeakServerSnapshot['clients'][number]): number => {
    const role = clientRole(serverId, client)
    switch (role) {
      case 'admin':
        return 0
      case 'moderator':
        return 1
      case 'registered':
      case 'supporter':
        return 2
      case 'music-bot':
        return 3
      default:
        return 4
    }
  }

  return [...clients].sort((a, b) => {
    const roleDiff = priority(a) - priority(b)
    if (roleDiff !== 0)
      return roleDiff

    const nameA = a.nickname?.toLowerCase() ?? ''
    const nameB = b.nickname?.toLowerCase() ?? ''
    return nameA.localeCompare(nameB)
  })
}

function visibleChannelClients(
  server: TeamSpeakServerSnapshot,
  channel: TeamSpeakNormalizedChannel,
): TeamSpeakNormalizedChannel['clients'] {
  const channelMap = clientsByServerChannel.value[server.id]
  if (!channelMap)
    return []

  const direct = (channel.clients ?? []).filter(client => client.uniqueId !== 'serveradmin')
  if (direct.length)
    return sortClients(server.id, direct)

  const fallback = channelMap.get(channel.id) ?? []
  return sortClients(server.id, fallback)
}

function serverClientCount(server: TeamSpeakServerSnapshot): number {
  const channelMap = clientsByServerChannel.value[server.id]
  if (!channelMap)
    return 0
  let total = 0
  channelMap.forEach((list) => {
    total += list.filter(client => !isMusicBot(server.id, client)).length
  })
  return total
}

function regionForServer(serverId: string): 'eu' | 'na' | 'all' | null {
  const id = serverId.toLowerCase()
  if (id.startsWith('eu'))
    return 'eu'
  if (id.startsWith('na'))
    return 'na'
  return null
}

function channelTalkState(channel: TeamSpeakNormalizedChannel): { required: number, moderated: boolean, muted: boolean } {
  const required = channel.requiredTalkPower ?? 0
  const moderated = channel.moderated ?? required > 0
  const muted = channel.muted ?? required > 100
  return { required, moderated, muted }
}

const renderRowsByServer = computed(() => {
  const map: Record<string, Array<{
    channel: TeamSpeakNormalizedChannel
    display: { label: string, isSpacer: boolean }
    visibleClients: TeamSpeakServerSnapshot['clients']
    clientCount: number
    isActive: boolean
    bulletActive: boolean
    bulletMuted: boolean
    bulletLabel: string
  }>> = {}

  servers.value.forEach((server) => {
    map[server.id] = (channelRowsByServer.value[server.id] ?? []).map((channel) => {
      const display = displayChannelName(channel)
      const visibleClients = visibleChannelClients(server, channel)
      const { required, moderated, muted } = channelTalkState(channel)

      const nonBotVisibleClients = visibleClients.filter(client => !isMusicBot(server.id, client))
      const displayClients = showMusicBots.value ? visibleClients : nonBotVisibleClients
      const rowClientCount = nonBotVisibleClients.length
      const bulletLabel = muted
        ? `Muted (talk power ≥ ${required})`
        : moderated
          ? `Moderated (talk power ≥ ${required})`
          : 'Active'

      return {
        channel,
        display,
        visibleClients: displayClients,
        clientCount: rowClientCount,
        isActive: rowClientCount > 0 && !isPokeChannel(channel),
        bulletActive: rowClientCount > 0 && !isPokeChannel(channel) && !muted,
        bulletMuted: muted,
        bulletLabel,
      }
    })
  })

  return map
})

function openRawSnapshot() {
  if (!process.client)
    return
  if (!rawSnapshotUrl.value)
    return

  window.open(rawSnapshotUrl.value, '_blank', 'noopener')
}
</script>

<template>
  <Card class="ts-viewer" separators>
    <template #header>
      <Flex expand x-between y-top gap="s">
        <Flex expand y-center gap="s" wrap>
          <Icon name="mdi:teamspeak" size="24" />
          <div v-if="serversSorted.length <= 1 || props.serverId">
            <strong class="text-xl">
              {{ selectedServer ? formatServerLabel(selectedServer) : platformTitle }}
              <span v-if="selectedServer && regionForServer(selectedServer.id) === 'eu'" class="text-xl">🇪🇺</span>
              <span v-else-if="selectedServer && regionForServer(selectedServer.id) === 'na'" class="text-xl">🇺🇸</span>
            </strong>
          </div>
          <Select
            v-else
            v-model="serverSelectModel"
            :options="serverOptions"
            placeholder="Select server"
            size="s"
          />
          <Flex v-if="selectedServer" x-start y-center gap="xs" wrap>
            <Badge variant="success">
              {{ serverClientCount(selectedServer) }} online
            </Badge>
            <Tooltip v-if="selectedServer.serverInfo?.platform || selectedServer.serverInfo?.version || selectedServer.serverInfo?.uptimeSeconds || selectedServer.collectedAt">
              <BadgeCircle variant="neutral">
                <Icon name="ph:info" size="16" class="ts-viewer__info-icon" />
              </BadgeCircle>
              <template #tooltip>
                <Grid gap="s" columns="96px 1fr" class="ts-viewer__info-tooltip">
                  <template v-if="selectedServer.serverInfo?.platform">
                    <strong>Platform</strong>
                    <span>{{ selectedServer.serverInfo?.platform }}</span>
                  </template>
                  <template v-if="selectedServer.serverInfo?.version">
                    <strong>Version</strong>
                    <span>{{ selectedServer.serverInfo?.version }}</span>
                  </template>
                  <template v-if="selectedServer.serverInfo?.uptimeSeconds">
                    <strong>Uptime</strong>
                    <span>{{ formatDuration(selectedServer.serverInfo?.uptimeSeconds) }}</span>
                  </template>
                </Grid>
              </template>
            </Tooltip>
            <Flex class="text-color-lightest">
              <TimestampDate
                :date="lastUpdated"
                size="xxs"
                :tooltip="true"
              />
            </Flex>
          </Flex>
        </Flex>
        <Flex gap="xs" y-center wrap x-end expand>
          <Tooltip placement="bottom">
            <Icon name="ph:music-notes" size="16" />
            <Switch
              v-model="showMusicBots"
              size="xs"
            />
            <template #tooltip>
              <div class="text-xs">
                Toggle visibility of music bot clients in the channel lists.
              </div>
            </template>
          </Tooltip>

          <Button
            size="s"
            square
            :loading="pending || manualRefreshPending"
            :disabled="pending || manualRefreshPending || !canRefresh"
            :data-title-top="!isBelowLarge ? 'Refresh' : null"
            aria-label="Refresh TeamSpeak snapshot"
            @click="handleRefresh"
          >
            <Icon name="ph:arrow-clockwise" size="16" />
          </Button>
          <Button
            size="s"
            square
            :disabled="!rawSnapshotUrl"

            :data-title-top="!isBelowLarge ? 'Open raw snapshot' : null"
            aria-label="Open raw TeamSpeak snapshot"
            @click="openRawSnapshot"
          >
            <Icon name="ph:code" size="16" />
          </Button>
          <Button
            v-if="teamspeakConnectUrl"
            size="s"
            variant="accent"
            :href="teamspeakConnectUrl"
            aria-label="Connect to TeamSpeak"
          >
            <template #start>
              <Icon name="mdi:phone-outgoing" size="16" />
            </template>
            Connect
          </Button>
        </Flex>
      </Flex>
    </template>

    <Flex v-if="pending && !data" expand column gap="s">
      <Skeleton :height="64" :radius="12" />
      <Skeleton :height="240" :radius="12" />
    </Flex>

    <ErrorAlert
      v-else-if="errorMessage"
      message="Failed to load TeamSpeak snapshot."
      :error="errorMessage"
    />

    <Alert v-else-if="!serversSorted.length" variant="info">
      No TeamSpeak servers are configured.
    </Alert>

    <Flex v-else-if="selectedServer" expand column gap="l">
      <Flex column expand gap="xs" class="ts-viewer__channels">
        <template v-for="row in renderRowsByServer[selectedServer.id] ?? []" :key="row.channel.id">
          <template v-if="row.display.isSpacer">
            <div class="ts-viewer__spacer">
              {{ row.display.label }}
            </div>
          </template>
          <Flex
            v-else
            column
            expand
            gap="xs"
            class="ts-viewer__channel-wrapper"
            :style="{ paddingLeft: `${row.channel.depth * 16}px` }"
          >
            <Flex
              expand
              class="ts-viewer__channel-row"
              :class="{ 'ts-viewer__channel-row--active': row.isActive }"
              column
              gap="xxs"
            >
              <div class="w-100">
                <Flex
                  expand
                  x-between
                  y-center
                  gap="s"
                  class="ts-viewer__channel-name"
                >
                  <Flex gap="s" y-center>
                    <Tooltip v-if="row.bulletActive || row.bulletMuted" placement="bottom">
                      <span
                        class="ts-viewer__channel-bullet"
                        :class="{
                          'ts-viewer__channel-bullet--active': row.bulletActive,
                          'ts-viewer__channel-bullet--muted': row.bulletMuted,
                        }"
                      />
                      <template #tooltip>
                        <span class="text-xs">
                          {{ row.bulletLabel }}
                        </span>
                      </template>
                    </Tooltip>
                    <span
                      v-else
                      class="ts-viewer__channel-bullet"
                    />
                    <span class="ts-viewer__channel-title">
                      {{ row.display.label }}
                    </span>
                  </Flex>
                  <Badge v-if="row.clientCount > 0" variant="neutral" size="s">
                    {{ row.clientCount }}
                  </Badge>
                </Flex>
              </div>

              <Flex
                v-if="row.visibleClients.length"
                expand
                wrap
                gap="xs"
                class="ts-viewer__client-list"
                :style="{ paddingLeft: '16px' }"
              >
                <Flex
                  v-for="client in row.visibleClients"
                  :key="`${row.channel.id}-${client.uniqueId}`"
                  gap="xs"
                  y-center
                  class="ts-viewer__client-bubble"
                  :class="{ 'full-mute': client.inputMuted && client.outputMuted }"
                >
                  <Icon
                    v-if="client.muted || client.inputMuted || client.outputMuted || client.channelMuted"
                    name="ph:microphone-slash-duotone"
                    size="14"
                  />
                  <span v-if="getCountryEmoji(client.country)" class="ts-viewer__client-flag">{{ getCountryEmoji(client.country) }}</span>
                  <UserLink
                    v-if="getUserIdForClient(selectedServer.id, client.uniqueId)"
                    :user-id="getUserIdForClient(selectedServer.id, client.uniqueId)"
                    class="ts-viewer__client-name"
                  />
                  <span v-else class="ts-viewer__client-name"> {{ client.nickname }}</span>
                  <RoleIndicator
                    v-if="clientRole(selectedServer.id, client)"
                    :role="clientRole(selectedServer.id, client)!"
                    size="xs"
                    shorten
                  />
                </Flex>
              </Flex>
            </Flex>
          </Flex>
        </template>
      </Flex>
    </Flex>
  </Card>
</template>

<style scoped>
.ts-viewer__server-header {
  padding-bottom: 4px;
}

.ts-viewer__channels {
  margin-top: 6px;
}

.ts-viewer__channel-row {
  border: 1px solid var(--color-border-weak);
  border-radius: 10px;
  padding: 8px 14px;
  background: var(--color-bg-raised);
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.ts-viewer__channel-row--head {
  border: none;
  background: transparent;
  padding: 0 2px;
  font-weight: 600;
}

.ts-viewer__channel-name {
  min-width: 0;
}

.ts-viewer__channel-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ts-viewer__channel-bullet {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-text-light);
  display: inline-block;
  flex-shrink: 0;
}

.ts-viewer__channel-bullet--active {
  background: var(--color-accent);
}

.ts-viewer__channel-bullet--muted {
  background: var(--color-text-invert);
}

.ts-viewer__spacer {
  margin: 6px 0;
  color: var(--color-text-lighter);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 11px;
}

.ts-viewer__client-bubble {
  border: 1px solid var(--color-border-weak);
  border-radius: 32px;
  padding: 6px 8px 6px 16px;
  background: var(--color-bg);
  color: var(--color-text-light);
  font-size: 13px;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.ts-viewer__client-name {
  font-size: var(--font-size-s);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ts-viewer__client-flag {
  font-size: 14px;
}

.ts-viewer__info-tooltip {
  max-width: 292px;

  span,
  strong {
    font-size: var(--n-font-size-s);
  }

  strong {
    color: var(--color-text-lighter);
  }
}
</style>
