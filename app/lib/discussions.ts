/**
 * Entity-link resolution for discussions attached to a profile, project,
 * event, gameserver, referendum or theme. Everything reads ENTITY_RESOLVERS so
 * the mapping lives in one place.
 */

interface DiscussionEntityFields {
  discussion_topic_id?: string | null
  slug?: string | null
  profile_id?: string | null
  project_id?: string | number | null
  event_id?: string | number | null
  gameserver_id?: string | number | null
  referendum_id?: string | number | null
  theme_id?: string | null
  profile?: { username?: string | null } | null
}

export interface DiscussionEntityContext {
  /** Lowercase, used inside sentences ("linked to a gameserver"). */
  label: string
  /** Capitalised, used on its own as a type tag in lists. */
  displayLabel: string
  href: string
  icon: string
}

const ENTITY_RESOLVERS: Array<{
  has: (d: DiscussionEntityFields) => boolean
  resolve: (d: DiscussionEntityFields) => DiscussionEntityContext
}> = [
  {
    has: d => d.profile_id != null,
    resolve: d => ({
      label: 'profile',
      displayLabel: 'Profile',
      href: `/profile/${d.profile?.username ?? d.profile_id}`,
      icon: 'ph:user-circle',
    }),
  },
  {
    has: d => d.project_id != null,
    resolve: d => ({
      label: 'project',
      displayLabel: 'Project',
      href: `/community/projects/${d.project_id}`,
      icon: 'ph:folder',
    }),
  },
  {
    has: d => d.event_id != null,
    resolve: d => ({
      label: 'event',
      displayLabel: 'Event',
      href: `/events/${d.event_id}`,
      icon: 'ph:calendar',
    }),
  },
  {
    has: d => d.gameserver_id != null,
    resolve: d => ({
      label: 'gameserver',
      displayLabel: 'Game server',
      href: `/servers/gameservers/${d.gameserver_id}`,
      icon: 'ph:computer-tower',
    }),
  },
  {
    has: d => d.referendum_id != null,
    resolve: d => ({
      label: 'referendum',
      displayLabel: 'Vote',
      href: `/votes/${d.referendum_id}`,
      icon: 'ph:user-sound',
    }),
  },
  {
    has: d => d.theme_id != null,
    resolve: d => ({
      label: 'theme',
      displayLabel: 'Theme',
      href: `/themes/${d.theme_id}`,
      icon: 'ph:paint-brush',
    }),
  },
]

// The first matching entity wins, whether or not the discussion has a topic.
export function getDiscussionEntityContext(d: DiscussionEntityFields): DiscussionEntityContext | null {
  for (const resolver of ENTITY_RESOLVERS) {
    if (resolver.has(d))
      return resolver.resolve(d)
  }
  return null
}

/**
 * A topic-less entity discussion isn't browseable as a forum thread, so it
 * redirects to its entity. With a topic it's a real thread and this is null.
 */
export function getDiscussionEntityHref(d: DiscussionEntityFields): string | null {
  if (d.discussion_topic_id != null)
    return null

  return getDiscussionEntityContext(d)?.href ?? null
}

// `discussionId` is the fallback for threads without a slug.
export function getDiscussionHref(d: DiscussionEntityFields | null, discussionId: string): string {
  const entityHref = d != null ? getDiscussionEntityHref(d) : null

  return entityHref ?? `/forum/${d?.slug ?? discussionId}`
}
