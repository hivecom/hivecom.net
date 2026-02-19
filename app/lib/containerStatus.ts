import constants from '~~/constants.json'

// Helper function for container status
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
    return 'stale' // Hasn't been updated for 2 hours (possibly removed)
  if (running && healthy === null)
    return 'running'
  if (running && healthy)
    return 'healthy'
  if (running && !healthy)
    return 'unhealthy'
  return 'stopped'
}
