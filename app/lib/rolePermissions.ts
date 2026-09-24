export type RoleVariant = 'danger' | 'info' | 'success' | 'neutral'

/**
 * Implicit baseline for every authenticated user. These aren't stored in
 * role_permissions.
 */
export const DEFAULT_USER_PERMISSIONS: string[] = [
  'discussion_topics.read',
  'discussions.read',
  'discussions.create',
  'discussions.update.own',
  'discussions.delete.own',
  'discussion_replies.read',
  'discussion_replies.create',
  'discussion_replies.update.own',
  'discussion_replies.delete.own',
  'events.read',
  'games.read',
  'profiles.read',
  'referendums.create',
  'referendums.read',
  'roles.read',
  'profiles.update.own',
  'complaints.create.own',
  'complaints.read.own',
  'referendum_votes.create',
  'referendum_votes.update.own',
  'referendum_votes.delete.own',
]

export function formatPermissionName(permission: string): string {
  const parts = permission.split('.')
  const [category, action, scope] = parts

  // Pseudo-permissions on the user role read badly when generated.
  if (permission === 'discussion_replies.update')
    return 'Update any reply'
  if (permission === 'discussion_replies.delete')
    return 'Delete any reply'
  if (permission === 'referendums.create')
    return 'Create private referendums'
  if (permission === 'referendum_votes.create')
    return 'Vote on referendums'
  if (permission === 'referendum_votes.update.own')
    return 'Update own votes'
  if (permission === 'referendum_votes.delete.own')
    return 'Delete own votes'
  if (permission === 'profiles.update.own')
    return 'Update own profile'
  if (permission === 'complaints.create.own')
    return 'Create own complaints'
  if (permission === 'complaints.read.own')
    return 'View own complaints'

  const categoryLabel = formatCategoryName(category ?? permission)

  if (scope === 'own' && action != null && action !== '') {
    return `${action.charAt(0).toUpperCase() + action.slice(1)} own ${categoryLabel.toLowerCase()}`
  }

  if (action === 'read') {
    return `View ${categoryLabel.toLowerCase()}`
  }

  if (action != null && action !== '') {
    return `${action.charAt(0).toUpperCase() + action.slice(1)} ${categoryLabel.toLowerCase()}`
  }

  return categoryLabel
}

export function formatCategoryName(category: string): string {
  const names: Record<string, string> = {
    alerts: 'Alerts',
    assets: 'Assets',
    complaints: 'Complaints',
    discussion_replies: 'Discussion Replies',
    discussion_topics: 'Discussion Topics',
    discussions: 'Discussions',
    events: 'Events',
    funding: 'Funding',
    games: 'Games',
    kvstore: 'KV Store',
    motds: 'MOTDs',
    network: 'Network',
    profiles: 'Profiles',
    projects: 'Projects',
    referendums: 'Referendums',
    referendum_votes: 'Referendum Votes',
    roles: 'Roles',
    users: 'Users',
  }

  return names[category]
    ?? category.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export function getRoleColor(role: string): string {
  switch (role) {
    case 'admin':
      return 'var(--color-text-red)'

    case 'moderator':
      return 'var(--color-text-blue)'

    case 'user':
      return 'var(--color-text-green)'

    default:
      return 'var(--color-text)'
  }
}

export function getRoleVariant(role: string): RoleVariant {
  switch (role) {
    case 'admin':
      return 'danger'

    case 'moderator':
      return 'info'

    case 'user':
      return 'success'

    default:
      return 'neutral'
  }
}

export function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    alerts: 'ph:warning-octagon',
    assets: 'ph:images-square',
    complaints: 'ph:flag',
    discussion_replies: 'ph:chat-dots',
    discussion_topics: 'ph:folders',
    discussions: 'ph:chat-circle-dots',
    events: 'ph:calendar-blank',
    funding: 'ph:coins',
    games: 'ph:game-controller',
    kvstore: 'ph:database',
    motds: 'ph:speaker-simple-high',
    network: 'ph:computer-tower',
    profiles: 'ph:user-circle',
    projects: 'ph:folder-open',
    referendums: 'ph:scales',
    referendum_votes: 'ph:check-square',
    roles: 'ph:shield-check',
    profile_points: 'ph:star',
    themes: 'ph:paint-brush',
    users: 'ph:users',
  }

  return icons[category] ?? 'ph:circle'
}
