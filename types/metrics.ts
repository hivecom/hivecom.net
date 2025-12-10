export interface MetricsTotals {
  users: number
  gameservers: number
  projects: number
}

export interface MetricsBreakdowns {
  usersByCountry: Record<string, number>
}

export interface MetricsSnapshot {
  collectedAt: string
  totals: MetricsTotals
  breakdowns: MetricsBreakdowns
}
