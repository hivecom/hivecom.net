/**
 * Entity-link resolution for discussions.
 *
 * A discussion can be attached to another entity (a profile, project, event,
 * gameserver, or referendum). Two views of that link are needed:
 *
 * - `getDiscussionEntityContext` returns the label/href/icon for the linking
 *   card shown on a forum thread, regardless of whether the discussion also has
 *   a topic.
 * - `getDiscussionEntityHref` returns the entity page href only for entity
 *   discussions that have NO topic - these aren't browseable as forum threads
 *   and should redirect to their parent entity. A discussion with a topic is a
 *   real thread and returns null (no redirect).
 *
 * Both read from the same resolver table so the mapping lives in one place.
 */

interface DiscussionEntityFields {
  discussion_topic_id?: string | null
  profile_id?: string | null
  project_id?: string | number | null
  event_id?: string | number | null
  gameserver_id?: string | number | null
  referendum_id?: string | number | null
  profile?: { username?: string | null } | null
}

export interface DiscussionEntityContext {
  label: string
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
      href: `/profile/${d.profile?.username ?? d.profile_id}`,
      icon: 'ph:user-circle',
    }),
  },
  {
    has: d => d.project_id != null,
    resolve: d => ({
      label: 'project',
      href: `/community/projects/${d.project_id}`,
      icon: 'ph:folder',
    }),
  },
  {
    has: d => d.event_id != null,
    resolve: d => ({
      label: 'event',
      href: `/events/${d.event_id}`,
      icon: 'ph:calendar',
    }),
  },
  {
    has: d => d.gameserver_id != null,
    resolve: d => ({
      label: 'gameserver',
      href: `/servers/gameservers/${d.gameserver_id}`,
      icon: 'ph:computer-tower',
    }),
  },
  {
    has: d => d.referendum_id != null,
    resolve: d => ({
      label: 'referendum',
      href: `/votes/${d.referendum_id}`,
      icon: 'ph:user-sound',
    }),
  },
]

/**
 * Returns the linking context (label, href, icon) for the first entity this
 * discussion is attached to, or null if it isn't linked to any entity.
 */
export function getDiscussionEntityContext(d: DiscussionEntityFields): DiscussionEntityContext | null {
  for (const resolver of ENTITY_RESOLVERS) {
    if (resolver.has(d))
      return resolver.resolve(d)
  }
  return null
}

/**
 * Returns the entity page href for entity-linked discussions that have no
 * topic. A discussion with a topic is a legitimate forum thread and renders
 * normally, so this returns null for it (no redirect).
 */
export function getDiscussionEntityHref(d: DiscussionEntityFields): string | null {
  if (d.discussion_topic_id != null)
    return null
  return getDiscussionEntityContext(d)?.href ?? null
}
