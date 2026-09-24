import type { Tables } from '@/types/database.overrides'

// `meta` is opaque JSONB the client never reads
export type RawComment = Omit<Tables<'discussion_replies'>, 'meta'> & { meta: never }

/** A reply with its parent reply resolved */
export interface Comment extends RawComment {
  reply: RawComment | null
}

export interface ThreadNode {
  comment: Comment
  children: ThreadNode[]
}

export type ProvidedDiscussion = Ref<Tables<'discussions'> | undefined>

export interface DiscussionSettings {
  timestamps: boolean
}
