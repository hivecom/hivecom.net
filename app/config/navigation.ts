const isDev = import.meta.dev

export interface CommandLink {
  path: string
  label: string
  group: string
  icon: string
  requiresAuth?: boolean
  requiresRole?: string[]
}

export const commandLinks: CommandLink[] = [
  // General
  { path: '/', label: 'Home', group: 'General', icon: 'ph:house' },
  { path: '/themes', label: 'Themes', group: 'General', icon: 'ph:circle-half-tilt-fill', requiresAuth: true },
  // Community
  { path: '/community', label: 'Community', group: 'Community', icon: 'ph:users' },
  { path: '/community/funding', label: 'Funding', group: 'Community', icon: 'ph:coins' },
  { path: '/community/badges', label: 'Badges', group: 'Community', icon: 'ph:medal' },
  { path: '/community/projects', label: 'Projects', group: 'Community', icon: 'ph:code' },
  // Forum
  { path: '/forum', label: 'Forum', group: 'Forum', icon: 'ph:chats-circle' },
  { path: '/forum/stats', label: 'Forum Statistics / Leaderboard', group: 'Forum', icon: 'ph:chart-bar' },
  // Events
  { path: '/events?tab=list', label: 'Events', group: 'Events', icon: 'ph:calendar' },
  { path: '/events?tab=calendar', label: 'Event Calendar', group: 'Events', icon: 'ph:calendar-dots' },
  // Servers
  { path: '/servers/gameservers', label: 'Game Servers', group: 'Servers', icon: 'ph:game-controller' },
  { path: '/servers/voiceservers', label: 'Voice Servers', group: 'Servers', icon: 'ph:microphone' },
  // Legal
  { path: '/legal/privacy', label: 'Privacy Policy', group: 'Legal', icon: 'ph:shield' },
  { path: '/legal/terms', label: 'Terms of Service', group: 'Legal', icon: 'ph:file-text' },
  // Account
  { path: '/votes', label: 'Votes', group: 'Account', icon: 'ph:check-square', requiresAuth: true },
  { path: '/profile', label: 'My Profile', group: 'Account', icon: 'ph:user', requiresAuth: true },
  { path: '/profile/settings', label: 'Settings', group: 'Account', icon: 'ph:gear', requiresAuth: true },
  // Admin
  { path: '/admin', label: 'Admin Dashboard', group: 'Admin', icon: 'ph:gauge', requiresRole: ['admin', 'moderator'] },
  { path: '/admin/users', label: 'Admin Users', group: 'Admin', icon: 'ph:users-three', requiresRole: ['admin', 'moderator'] },
  { path: '/admin/complaints', label: 'Admin Complaints', group: 'Admin', icon: 'ph:warning', requiresRole: ['admin', 'moderator'] },
  { path: '/admin/discussions', label: 'Admin Discussions', group: 'Admin', icon: 'ph:chat-circle', requiresRole: ['admin', 'moderator'] },
  { path: '/admin/events', label: 'Admin Events', group: 'Admin', icon: 'ph:calendar', requiresRole: ['admin', 'moderator'] },
  { path: '/admin/network', label: 'Admin Network', group: 'Admin', icon: 'ph:network', requiresRole: ['admin', 'moderator'] },
  { path: '/admin/projects', label: 'Admin Projects', group: 'Admin', icon: 'ph:code', requiresRole: ['admin', 'moderator'] },
  { path: '/admin/funding', label: 'Admin Funding', group: 'Admin', icon: 'ph:coins', requiresRole: ['admin', 'moderator'] },
  { path: '/admin/assets', label: 'Admin Assets', group: 'Admin', icon: 'ph:folder-open', requiresRole: ['admin', 'moderator'] },
  { path: '/admin/referendums', label: 'Admin Referendums', group: 'Admin', icon: 'ph:check-square', requiresRole: ['admin', 'moderator'] },
  { path: '/admin/games', label: 'Admin Games', group: 'Admin', icon: 'ph:game-controller', requiresRole: ['admin'] },
  { path: '/admin/motds', label: 'Admin MOTDs', group: 'Admin', icon: 'ph:megaphone', requiresRole: ['admin'] },
  { path: '/admin/kvstore', label: 'Admin KV Store', group: 'Admin', icon: 'ph:database', requiresRole: ['admin'] },
  // Dev only
  ...(isDev ? [{ path: '/playground', label: 'Playground', group: 'Dev', icon: 'ph:flask' }] : []),
]

export const navigationLinks = [
  {
    path: '/',
    label: 'Home',
    icon: 'ph:house',
  },
  {
    path: '/community',
    label: 'Community',
    icon: 'ph:users',
    children: [
      {
        path: '/community',
        label: 'About',
      },
      {
        path: '/community/funding',
        label: 'Funding',
      },
      {
        path: '/community/projects',
        label: 'Projects',
      },
    ],
  },
  {
    path: '/events?tab=list',
    label: 'Events',
    icon: 'ph:calendar',
    children: [
      {
        path: '/events?tab=list',
        label: 'List',
      },
      {
        path: '/events?tab=calendar',
        label: 'Calendar',
      },
    ],
  },
  {
    path: '/forum',
    label: 'Forum',
    icon: 'ph:chats-circle',
  },
  {
    path: '/servers/gameservers?tab=list',
    label: 'Servers',
    icon: 'ph:game-controller',
    children: [
      {
        path: '/servers/gameservers?tab=library',
        label: 'Game Servers',
      },
      {
        path: '/servers/voiceservers',
        label: 'Voice Servers',
      },
    ],
  },
  {
    path: '/votes',
    label: 'Votes',
    icon: 'ph:check-square',
    requiresAuth: true,
  },
]
