export interface TeamSpeakIdentityRecord {
  serverId: string
  uniqueId: string
  linkedAt?: string
}

export interface TeamSpeakNormalizedClient {
  uniqueId: string
  databaseId: string | null
  nickname: string
  channelId: string | null
  channelName: string | null
  channelPath: string[] | null
  serverGroups: number[]
  away: boolean
  muted: boolean
  inputMuted: boolean
  outputMuted: boolean
  country?: string | null
  createdAt?: number | null
  lastConnectedAt?: number | null
}

export interface TeamSpeakNormalizedChannel {
  id: string
  parentId: string | null
  order: number
  name: string
  totalClients: number
  subscribePower?: number
  depth: number
  path: string[]
  children: TeamSpeakNormalizedChannel[]
  clients: TeamSpeakNormalizedClient[]
}

export interface TeamSpeakServerInfo {
  name?: string
  platform?: string
  version?: string
  uptimeSeconds?: number
  maxClients?: number
  totalClients?: number
  totalChannels?: number
}

export interface TeamSpeakServerSnapshot {
  id: string
  title?: string
  collectedAt: string
  serverInfo?: TeamSpeakServerInfo
  channels: TeamSpeakNormalizedChannel[]
  clients: TeamSpeakNormalizedClient[]
}

export interface TeamSpeakSnapshot {
  collectedAt: string
  servers: TeamSpeakServerSnapshot[]
}
