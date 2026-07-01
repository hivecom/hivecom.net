// Protocol-specific server detail shapes
export interface SourcePlayer {
  name: string
  score: number
  duration: number
}

export interface MetricsServerDetailSource {
  protocol: 'source'
  data: {
    players: number | null
    maxPlayers: number | null
    map: string | null
    playerList: SourcePlayer[] | null
  }
}

export interface MetricsServerDetailMinecraft {
  protocol: 'minecraft'
  data: {
    numPlayers: number | null
    maxPlayers: number | null
    world: string | null
    players: string[] | null
    motd: string | null
    gameType: string | null
    gameId: string | null
    version: string | null
    plugins: string | null
    hostPort: number | null
    hostIp: string | null
    extra: Record<string, string> | null
  }
}

export interface GameSpyPlayer {
  name: string
  frags: number | null
  ping: number | null
  team: string | null
}

export interface MetricsServerDetailGameSpy {
  protocol: 'gamespy1'
  data: {
    numPlayers: number | null
    maxPlayers: number | null
    map: string | null
    hostName: string | null
    gameType: string | null
    players: GameSpyPlayer[] | null
    extra: Record<string, string> | null
  }
}

export type SatisfactoryServerState = 'offline' | 'idle' | 'loading' | 'playing' | 'unknown'

// Satisfactory's lightweight query protocol does NOT expose player counts -
// only run state and server name. Player totals therefore treat it as 0.
export interface MetricsServerDetailSatisfactory {
  protocol: 'satisfactory'
  data: {
    reachable: boolean
    joinable: boolean
    state: SatisfactoryServerState
    serverName: string | null
    serverNetCL: number | null
  }
}

export interface MetricsServerDetailFactorio {
  protocol: 'factorio'
  data: {
    numPlayers: number | null
    // 0 means unlimited; null when not retrieved (default RCON count mode).
    maxPlayers: number | null
    // Player names. Empty unless the opt-in Lua mode is used.
    players: string[] | null
  }
}

// Servers with no query protocol configured
export interface MetricsServerDetailNone {
  protocol: null
  data: null
}

// Union - extend with new protocol interfaces as they are implemented
export type MetricsServerDetail
  = | MetricsServerDetailSource
    | MetricsServerDetailMinecraft
    | MetricsServerDetailGameSpy
    | MetricsServerDetailSatisfactory
    | MetricsServerDetailFactorio
    | MetricsServerDetailNone

// ---------------------------------------------------------------------------
// Cross-protocol accessors
// ---------------------------------------------------------------------------
// Different query protocols expose player data under different field names
// (and Satisfactory not at all). These helpers centralise the per-protocol
// mapping so call sites don't each re-implement the protocol switch.

/** Current online player count, or null when unknown/unsupported. */
export function metricsPlayerCount(
  detail: MetricsServerDetail | null | undefined,
): number | null {
  if (!detail?.data)
    return null
  switch (detail.protocol) {
    case 'source':
      return detail.data.players
    case 'minecraft':
    case 'gamespy1':
    case 'factorio':
      return detail.data.numPlayers
    case 'satisfactory':
      return null
    default:
      return null
  }
}

/** Configured max player count, or null when unknown/unsupported. */
export function metricsMaxPlayers(
  detail: MetricsServerDetail | null | undefined,
): number | null {
  if (!detail?.data)
    return null
  switch (detail.protocol) {
    case 'source':
    case 'minecraft':
    case 'gamespy1':
    case 'factorio':
      return detail.data.maxPlayers
    case 'satisfactory':
      return null
    default:
      return null
  }
}

/** Current map/level name, or null when the protocol doesn't report one. */
export function metricsCurrentMap(
  detail: MetricsServerDetail | null | undefined,
): string | null {
  if (!detail?.data)
    return null
  if (detail.protocol === 'source' || detail.protocol === 'gamespy1')
    return detail.data.map
  return null
}

export interface MetricsUsers {
  total: number
  online: number
  byCountry: Record<string, number>
  byGame: Record<string, number>
  /** Maps Steam app ID (as string) to player count. Only includes users with rich_presence_enabled. */
  bySteamGame: Record<string, number>
}

export interface MetricsCommunity {
  projects: number
}

export interface MetricsDiscussions {
  total: number
  replies: number
  newTotal: number
  newReplies: number
}

export interface MetricsTeamSpeak {
  online: number
  byServer: Record<string, number>
}

export interface MetricsGameServers {
  total: number
  players: number
  byServer: Record<string, MetricsServerDetail>
}

export interface MetricsStorageBucket {
  /** Total number of objects in the bucket */
  totalFiles: number
  /** Total size of all objects in bytes */
  totalSize: number
  /** Number of image objects */
  totalImages: number
  /** Delta in file count since previous snapshot */
  deltaFiles: number
  /** Delta in total size (bytes) since previous snapshot */
  deltaSize: number
}

export interface MetricsStorage {
  buckets: Record<string, MetricsStorageBucket>
}

export interface MetricsSnapshot {
  collectedAt: string
  users: MetricsUsers
  community: MetricsCommunity
  discussions: MetricsDiscussions
  teamspeak: MetricsTeamSpeak
  gameservers: MetricsGameServers
  storage: MetricsStorage
}
