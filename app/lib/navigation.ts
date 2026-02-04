export const navigationLinks = [
  {
    path: '/',
    label: 'Home',
    icon: 'ph:house',
  },
  // {
  //   path: '/announcements',
  //   label: 'Announcements',
  //   icon: 'ph:megaphone',
  // },
  {
    path: '/forum',
    label: 'Forum',
    icon: 'ph:chats-circle',
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
