<script setup lang="ts">
import type { TeamSpeakNormalizedChannel, TeamSpeakServerSnapshot, TeamSpeakSnapshot } from '@/types/teamspeak'
import { Alert, Badge, Button, Card, Divider, Flex, Skeleton } from '@dolanske/vui'
import { computed } from 'vue'
import constants from '~~/constants.json'
import ErrorAlert from '@/components/Shared/ErrorAlert.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { useTeamSpeakSnapshot } from '@/composables/useTeamSpeakSnapshot'

interface Props {
  refreshInterval?: number
  /** Optional explicit server data for embedding/testing. */
  servers?: TeamSpeakServerSnapshot[] | null
}

const props = withDefaults(defineProps<Props>(), {
  refreshInterval: 30 * 60 * 1000,
  servers: null,
})

const MOCK_SNAPSHOT: TeamSpeakSnapshot = {
  collectedAt: new Date().toISOString(),
  servers: [
    {
      id: 'mock',
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
          depth: 0,
          path: ['Lobby'],
          children: [],
          clients: [
            {
              uniqueId: 'alpha',
              nickname: 'MockUser',
              channelId: '1',
              channelName: 'Lobby',
              channelPath: ['Lobby'],
              serverGroups: [],
              away: false,
              muted: false,
              inputMuted: false,
              outputMuted: false,
            },
          ],
        },
        {
          id: '2',
          parentId: '0',
          order: 1,
          name: '[spacer0]Games',
          totalClients: 0,
          depth: 0,
          path: ['[spacer0]Games'],
          children: [
            {
              id: '3',
              parentId: '2',
              order: 0,
              name: 'General',
              totalClients: 1,
              depth: 1,
              path: ['[spacer0]Games', 'General'],
              children: [],
              clients: [
                {
                  uniqueId: 'beta',
                  nickname: 'GamerOne',
                  channelId: '3',
                  channelName: 'General',
                  channelPath: ['[spacer0]Games', 'General'],
                  serverGroups: [],
                  away: true,
                  muted: false,
                  inputMuted: true,
                  outputMuted: false,
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

const platformTitle = computed(() => constants.PLATFORMS?.TEAMSPEAK?.title ?? 'TeamSpeak')
const snapshotServers = computed(() => (data.value as TeamSpeakSnapshot | null)?.servers ?? [])
const servers = computed<TeamSpeakServerSnapshot[]>(() => {
  if (props.servers && props.servers.length)
    return props.servers

  if (snapshotServers.value.length)
    return snapshotServers.value

  if (import.meta.dev)
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

const channelRowsByServer = computed<Record<string, TeamSpeakNormalizedChannel[]>>(() => {
  const map: Record<string, TeamSpeakNormalizedChannel[]> = {}
  servers.value.forEach((server: TeamSpeakServerSnapshot) => {
    map[server.id] = flattenChannels(server.channels)
  })
  return map
})

const resolvedLastUpdated = computed(() => {
  if (props.servers && props.servers.length)
    return props.servers[0]?.collectedAt ?? null

  if (!snapshotServers.value.length && import.meta.dev)
    return MOCK_SNAPSHOT.collectedAt

  return lastUpdated.value
})

const errorMessage = computed(() => {
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

function clientMicStatus(client: TeamSpeakServerSnapshot['clients'][number]): string {
  if (client.muted || client.inputMuted || client.outputMuted)
    return 'Muted'
  if (client.away)
    return 'Away'
  return 'Active'
}

function clientCount(channel: TeamSpeakNormalizedChannel): number {
  if (channel.clients.length > 0)
    return channel.clients.length
  return Number.isFinite(channel.totalClients) ? channel.totalClients : 0
}
</script>

<template>
  <Flex column gap="m" class="ts-viewer">
    <Flex x-between y-center gap="s">
      <Flex y-center gap="s">
        <Icon name="mdi:teamspeak" size="24" />
        <div>
          <div class="text-l">
            {{ platformTitle }}
          </div>
          <div class="text-xs text-dimmed">
            <template v-if="resolvedLastUpdated">
              Updated <TimestampDate :date="resolvedLastUpdated" size="xs" />
            </template>
            <template v-else>
              Waiting for first snapshot…
            </template>
          </div>
        </div>
      </Flex>
      <Button size="s" plain :loading="pending" @click="refresh">
        Refresh
      </Button>
    </Flex>

    <Flex v-if="pending && !data" column gap="s">
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

    <Flex v-else column gap="m">
      <Card v-for="server in serversSorted" :key="server.id" class="ts-viewer__server-card">
        <Flex x-between y-center gap="s" class="ts-viewer__server-header">
          <Flex y-center gap="s">
            <Badge variant="accent" size="s">
              {{ server.title ?? server.id.toUpperCase() }}
            </Badge>
            <div>
              <div class="text-m">
                {{ formatServerLabel(server) }}
              </div>
              <div class="text-xs text-dimmed">
                Snapshot <TimestampDate :date="server.collectedAt" size="xs" />
              </div>
            </div>
          </Flex>
          <Flex gap="xs" wrap y-center>
            <Badge variant="success" size="s">
              {{ server.serverInfo?.totalClients ?? server.clients.length }} online
            </Badge>
            <Badge variant="neutral" size="s">
              {{ channelRowsByServer[server.id]?.length ?? server.channels.length }} channels
            </Badge>
            <Badge v-if="server.serverInfo?.maxClients" variant="neutral" size="s">
              Max {{ server.serverInfo?.maxClients }}
            </Badge>
            <Badge v-if="server.serverInfo?.uptimeSeconds" variant="neutral" size="s">
              Uptime {{ formatDuration(server.serverInfo?.uptimeSeconds) }}
            </Badge>
          </Flex>
        </Flex>

        <Flex gap="s" wrap class="ts-viewer__meta">
          <Badge v-if="server.serverInfo?.platform" variant="neutral" size="xs">
            Platform: {{ server.serverInfo?.platform }}
          </Badge>
          <Badge v-if="server.serverInfo?.version" variant="neutral" size="xs">
            Version: {{ server.serverInfo?.version }}
          </Badge>
          <Badge v-if="server.serverInfo?.totalChannels !== undefined" variant="neutral" size="xs">
            {{ server.serverInfo?.totalChannels }} total channels
          </Badge>
        </Flex>

        <div class="ts-viewer__channels">
          <div class="ts-viewer__channel-row ts-viewer__channel-row--head">
            <span>Channel</span>
            <span>Clients</span>
          </div>
          <template v-for="channel in channelRowsByServer[server.id] ?? []" :key="channel.id">
            <template v-if="displayChannelName(channel).isSpacer">
              <Divider class="ts-viewer__spacer" size="s">
                {{ displayChannelName(channel).label }}
              </Divider>
            </template>
            <div
              v-else
              class="ts-viewer__channel-row"
              :class="{ 'ts-viewer__channel-row--active': channel.clients.length > 0 }"
            >
              <Flex x-between y-center gap="s">
                <Flex
                  y-center
                  gap="s"
                  class="ts-viewer__channel-name"
                  :style="{ paddingLeft: `${channel.depth * 12}px` }"
                >
                  <span class="ts-viewer__channel-bullet" />
                  <span class="ts-viewer__channel-title">
                    {{ displayChannelName(channel).label }}
                  </span>
                </Flex>
                <Badge variant="neutral" size="s">
                  {{ clientCount(channel) }}
                </Badge>
              </Flex>
              <div v-if="channel.clients.length" class="ts-viewer__client-list">
                <div
                  v-for="client in channel.clients"
                  :key="`${channel.id}-${client.uniqueId}`"
                  class="ts-viewer__client-row"
                >
                  <Flex gap="xs" y-center>
                    <Icon v-if="client.away" name="ph:clock-duotone" />
                    <Icon v-else-if="client.muted || client.inputMuted || client.outputMuted" name="ph:microphone-slash-duotone" />
                    <Icon v-else name="ph:user-circle-duotone" />
                    <span class="ts-viewer__client-name">{{ client.nickname }}</span>
                    <Badge size="xxs" variant="neutral">
                      {{ clientMicStatus(client) }}
                    </Badge>
                    <Badge v-if="client.serverGroups.length" size="xxs" variant="neutral">
                      Groups: {{ client.serverGroups.join(', ') }}
                    </Badge>
                  </Flex>
                </div>
              </div>
            </div>
          </template>
        </div>
      </Card>
    </Flex>
  </Flex>
</template>

<style scoped>
.ts-viewer__server-card {
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.ts-viewer__server-header {
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  padding-bottom: 8px;
}

.ts-viewer__meta {
  margin: 8px 0 4px;
}

.ts-viewer__channels {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.ts-viewer__channel-row {
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.02);
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

.ts-viewer__channel-row--active {
  border-color: rgba(94, 234, 212, 0.65);
  background: rgba(94, 234, 212, 0.08);
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
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.35);
  display: inline-block;
}

.ts-viewer__spacer {
  margin: 4px 0;
  color: var(--color-text-dimmed, rgba(255, 255, 255, 0.6));
}

.ts-viewer__client-list {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ts-viewer__client-row {
  padding-left: 20px;
  color: var(--color-text-dimmed, rgba(255, 255, 255, 0.8));
}

.ts-viewer__client-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
