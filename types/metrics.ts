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

// Satisfactory's lightweight query protocol has no player counts, only run state
// and server name. Player totals count it as 0.
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

export interface TrackmaniaPlayer {
  // Nickname with TM formatting stripped
  name: string
  login: string
  spectator: boolean
  // Rank and best time (ms) on the current track this session. null until the
  // player finishes a run.
  rank: number | null
  bestTime: number | null
}

export interface MetricsServerDetailTrackmania {
  protocol: 'trackmania'
  data: {
    numPlayers: number | null
    maxPlayers: number | null
    map: string | null
    hostName: string | null
    gameType: string | null
    players: TrackmaniaPlayer[] | null
    extra: Record<string, string> | null
  }
}

export interface MetricsServerDetailNone {
  protocol: null
  data: null
}

export type MetricsServerDetail
  = | MetricsServerDetailSource
    | MetricsServerDetailMinecraft
    | MetricsServerDetailGameSpy
    | MetricsServerDetailSatisfactory
    | MetricsServerDetailFactorio
    | MetricsServerDetailTrackmania
    | MetricsServerDetailNone

// ---------------------------------------------------------------------------
// Cross-protocol accessors
// ---------------------------------------------------------------------------
// Protocols name player fields differently, and Satisfactory has none

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
    case 'trackmania':
      return detail.data.numPlayers
    case 'satisfactory':
      return null
    default:
      return null
  }
}

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
    case 'trackmania':
      return detail.data.maxPlayers
    case 'satisfactory':
      return null
    default:
      return null
  }
}

export function metricsCurrentMap(
  detail: MetricsServerDetail | null | undefined,
): string | null {
  if (!detail?.data)
    return null
  if (detail.protocol === 'source' || detail.protocol === 'gamespy1' || detail.protocol === 'trackmania')
    return detail.data.map
  return null
}

export interface MetricsUsers {
  total: number
  online: number
  byCountry: Record<string, number>
  byGame: Record<string, number>
  /** Keyed by Steam app ID. Only users with rich_presence_enabled. */
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

export interface MetricsIrc {
  online: number
  /** Publicly listable channels only */
  channels: number
  /** During the collection interval */
  messages: number
  /** Listable channels only */
  byChannel: Record<string, number>
  /** Listable channels only, during the collection interval */
  messagesByChannel: Record<string, number>
}

export interface MetricsGameServers {
  total: number
  players: number
  byServer: Record<string, MetricsServerDetail>
}

export interface MetricsStorageBucket {
  totalFiles: number
  /** Bytes */
  totalSize: number
  totalImages: number
  /** Since the previous snapshot */
  deltaFiles: number
  /** Bytes, since the previous snapshot */
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
  irc: MetricsIrc
  gameservers: MetricsGameServers
  storage: MetricsStorage
}
