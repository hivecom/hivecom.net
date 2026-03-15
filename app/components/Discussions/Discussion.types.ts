import type { Tables } from '@/types/database.overrides'

/**
 * A raw discussion reply row from the database, with `meta` stripped to
 * `never` since we never read it on the client (it's opaque JSONB).
 */
export type RawComment = Omit<Tables<'discussion_replies'>, 'meta'> & { meta: never }

/**
 * A reply with its parent reply resolved (if any).
 */
export interface Comment extends RawComment {
  reply: RawComment | null
}

/**
 * A node in the threaded view tree: a comment plus its direct children.
 */
export interface ThreadNode {
  comment: Comment
  children: ThreadNode[]
}

/**
 * The shape of the `discussion` ref injected via DISCUSSION_KEYS.discussion.
 */
export type ProvidedDiscussion = Ref<Tables<'discussions'> | undefined>

/**
 * Per-discussion display settings provided to all descendant components.
 */
export interface DiscussionSettings {
  /**
   * If set to true, comments will display a timestamp.
   */
  timestamps: boolean
}
