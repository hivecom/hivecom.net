/**
 * Pure helper functions for role permission display formatting.
 * Extracted from Admin/Roles/RolesTable.vue - no Vue dependency.
 */

export type RoleVariant = 'danger' | 'info' | 'success' | 'neutral'

/**
 * Formats a raw permission string (e.g. "complaints.create.own") into a
 * human-readable label.
 */
export function formatPermissionName(permission: string): string {
  const parts = permission.split('.')
  const [category, action, scope] = parts

  if (scope === 'own' && action != null && action !== '') {
    return `${action.charAt(0).toUpperCase() + action.slice(1)} own ${category}`
  }

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

  if (action != null && action !== '') {
    return `${action.charAt(0).toUpperCase() + action.slice(1)} ${category}`
  }

  return category != null && category !== '' ? category : permission
}

/**
 * Capitalises the first letter of a permission category string.
 */
export function formatCategoryName(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1)
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
    announcements: 'ph:megaphone',
    assets: 'ph:images-square',
    complaints: 'ph:flag',
    containers: 'ph:computer-tower',
    events: 'ph:calendar-blank',
    expenses: 'ph:coins',
    forums: 'ph:chat-circle',
    funding: 'ph:coins',
    games: 'ph:game-controller',
    gameservers: 'ph:computer-tower',
    kvstore: 'ph:database',
    motds: 'ph:speaker-simple-high',
    profiles: 'ph:user',
    projects: 'ph:folder',
    referendums: 'ph:user-sound',
    referendum_votes: 'ph:user-sound',
    roles: 'ph:user',
    servers: 'ph:computer-tower',
    users: 'ph:user',
  }

  return icons[category] ?? 'ph:circle'
}
