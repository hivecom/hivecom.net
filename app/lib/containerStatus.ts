import constants from '~~/constants.json'

export function getContainerStatus(
  reportedAt: string,
  running: boolean,
  healthy?: boolean | null,
  controlOffline = false,
  isRestarting = false,
) {
  if (controlOffline)
    return 'control_offline'
  if (isRestarting)
    return 'restarting'
  if (reportedAt && new Date(reportedAt) < new Date(Date.now() - 1000 * 60 * 60 * constants.CONTAINERS.STALE_HOURS))
    return 'stale' // no report within STALE_HOURS, possibly removed
  if (running && healthy === null)
    return 'running'
  if (running && healthy)
    return 'healthy'
  if (running && !healthy)
    return 'unhealthy'

  return 'stopped'
}
