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
  talkPower: number | null
  channelRequiredTalkPower: number | null
  channelModerated: boolean
  channelMuted: boolean
  country?: string | null
  createdAt?: number | null
  lastConnectedAt?: number | null
  channelGroupId?: number | null
  idleTimeMs?: number | null
  version?: string | null
  platform?: string | null
  description?: string | null
  totalConnections?: number | null
  connectedTimeMs?: number | null
  avatar?: TeamSpeakClientAvatar | null
}

export interface TeamSpeakClientAvatar {
  /** Object path in the static content bucket. */
  path: string

  /** TeamSpeak's md5 of the image, for cache busting. */
  hash: string
}

export interface TeamSpeakGroup {
  id: number
  name: string
}

export interface TeamSpeakNormalizedChannel {
  id: string
  parentId: string | null
  order: number
  name: string
  totalClients: number
  requiredTalkPower?: number
  moderated: boolean
  muted: boolean
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
  defaultChannelGroupId?: number
}

export interface TeamSpeakServerSnapshot {
  id: string
  title?: string
  collectedAt: string
  serverInfo?: TeamSpeakServerInfo
  serverGroups?: TeamSpeakGroup[]
  channelGroups?: TeamSpeakGroup[]
  channels: TeamSpeakNormalizedChannel[]
  clients: TeamSpeakNormalizedClient[]
}

export interface TeamSpeakSnapshot {
  collectedAt: string
  servers: TeamSpeakServerSnapshot[]
}
