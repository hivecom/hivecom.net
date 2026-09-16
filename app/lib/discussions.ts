/**
 * Entity-link resolution for discussions.
 *
 * A discussion can be attached to another entity (a profile, project, event,
 * gameserver, referendum, or theme). Three views of that link are needed:
 *
 * - `getDiscussionEntityContext` returns the label/href/icon for the linking
 *   card shown on a forum thread, regardless of whether the discussion also has
 *   a topic.
 * - `getDiscussionEntityHref` returns the entity page href only for entity
 *   discussions that have NO topic - these aren't browseable as forum threads
 *   and should redirect to their parent entity. A discussion with a topic is a
 *   real thread and returns null (no redirect).
 * - `getDiscussionHref` is the list-side version of the same call: where a link
 *   to this discussion should actually point.
 *
 * All three read from the same resolver table so the mapping lives in one place.
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

/**
 * Where a link to this discussion should point from a list: the entity page for
 * topic-less entity discussions, the thread itself for everything else.
 *
 * `discussionId` is the fallback for threads without a slug.
 */
export function getDiscussionHref(d: DiscussionEntityFields | null, discussionId: string): string {
  const entityHref = d != null ? getDiscussionEntityHref(d) : null

  return entityHref ?? `/forum/${d?.slug ?? discussionId}`
}
