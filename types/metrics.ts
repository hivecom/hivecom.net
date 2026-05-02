export interface MetricsServerDetail {
  players: number | null
  maxPlayers: number | null
  map: string | null
}

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
