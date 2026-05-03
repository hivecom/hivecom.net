// Protocol-specific server detail shapes
export interface MetricsServerDetailSource {
  protocol: 'source'
  data: {
    players: number | null
    maxPlayers: number | null
    map: string | null
  }
}

// Servers with no query protocol configured
export interface MetricsServerDetailNone {
  protocol: null
  data: null
}

// Union - extend with new protocol interfaces as they are implemented
export type MetricsServerDetail = MetricsServerDetailSource | MetricsServerDetailNone

export interface MetricsMembers {
  total: number
  online: number
  byCountry: Record<string, number>
  byGame: Record<string, number>
}

export interface MetricsCommunity {
  projects: number
  forumPosts: number
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

export interface MetricsSnapshot {
  collectedAt: string
  members: MetricsMembers
  community: MetricsCommunity
  teamspeak: MetricsTeamSpeak
  gameservers: MetricsGameServers
}
