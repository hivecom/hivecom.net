/**
 * Pure helper functions for role permission display formatting.
 * Extracted from Admin/Roles/RolesGrid.vue - no Vue dependency.
 */

export type RoleVariant = 'danger' | 'info' | 'success' | 'neutral'

/**
 * Permissions implicitly granted to all authenticated users (the 'user' role).
 * These are not stored in role_permissions - they are the hardcoded baseline.
 * Shared between RolesGrid display and role impersonation.
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

/**
 * Formats a raw permission string (e.g. "complaints.create.own") into a
 * human-readable label.
 */
export function formatPermissionName(permission: string): string {
  const parts = permission.split('.')
  const [category, action, scope] = parts

  // Fully-qualified overrides for pseudo-permissions on the user role
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

/**
 * Maps known category slugs to clean human-readable display names.
 * Falls back to capitalising and splitting underscores for unknown categories.
 */
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

/**
 * Maps a role name to a CSS colour token string.
 */
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

/**
 * Maps a role name to its corresponding VUI badge variant.
 */
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

/**
 * Maps a permission category name to its corresponding Phosphor icon string.
 */
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
