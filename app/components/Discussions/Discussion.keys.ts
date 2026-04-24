/**
 * Typed InjectionKey symbols for the Discussion component's provide/inject pairs.
 *
 * All 10 bare-string provide/inject usages in Discussion.vue, DiscussionModelForum.vue,
 * DiscussionModelComment.vue, and DiscussionItem.vue are replaced with these typed keys.
 *
 * Usage:
 *   // Provider (Discussion.vue):
 *   import { DISCUSSION_KEYS } from './Discussion.keys'
 *   provide(DISCUSSION_KEYS.viewMode, viewMode)
 *
 *   // Consumer (DiscussionModelForum.vue etc.):
 *   import { DISCUSSION_KEYS } from '../Discussions/Discussion.keys'
 *   const viewMode = inject(DISCUSSION_KEYS.viewMode, ref<'flat' | 'threaded'>('flat'))
 */

import type { InjectionKey, Ref } from 'vue'
import type { Comment, DiscussionSettings, ProvidedDiscussion } from './Discussion.types'

export const DISCUSSION_KEYS = {
  /** Callback to lazily load children for a root comment (threaded view) */
  loadChildren: Symbol('loadChildren') as InjectionKey<(rootId: string) => Promise<void>>,

  /** Callback to navigate to a comment by ID, loading its page if needed */
  navigateToComment: Symbol('navigateToComment') as InjectionKey<(id: string) => Promise<boolean>>,

  /**
   * A reactive map of reply ID → count of direct (non-deleted) child replies.
   * Fetched once at discussion load time so the flat view can display correct
   * reply counts even before children have been lazily loaded.
   */
  replyCountMap: Symbol('replyCountMap') as InjectionKey<Ref<Map<string, number>>>,
  /** The current view mode: 'flat' | 'threaded' */
  viewMode: Symbol('viewMode') as InjectionKey<Ref<'flat' | 'threaded'>>,

  /** Whether the current user can bypass discussion locks (admin/moderator) */
  canBypassLock: Symbol('canBypassLock') as InjectionKey<Ref<boolean>>,

  /** Callback to set the comment being replied to */
  setReplyToComment: Symbol('setReplyToComment') as InjectionKey<(comment: Comment) => void>,

  /** Callback to set the comment being quoted in the editor */
  setQuoteOfComment: Symbol('setQuoteOfComment') as InjectionKey<(comment: Comment) => void>,

  /** Callback to toggle a comment's off-topic status */
  toggleOfftopic: Symbol('toggleOfftopic') as InjectionKey<(comment: Comment) => Promise<void>>,

  /** Callback to delete a comment by ID (soft delete - marks as deleted) */
  deleteComment: Symbol('delete-comment') as InjectionKey<(id: string) => Promise<unknown>>,

  /** Callback to permanently force-delete a comment by ID (admin only, hard DELETE) */
  forceDeleteComment: Symbol('force-delete-comment') as InjectionKey<(id: string) => Promise<unknown>>,

  /** The discussion row itself */
  discussion: Symbol('discussion') as InjectionKey<ProvidedDiscussion>,

  /** Discussion display settings (timestamps, etc.) */
  discussionSettings: Symbol('discussion-settings') as InjectionKey<DiscussionSettings>,

  /** Whether off-topic replies are currently visible */
  showOfftopic: Symbol('showOfftopic') as InjectionKey<Ref<boolean>>,

  /** Whether the current user can mark replies as off-topic */
  canMarkOfftopic: Symbol('canMarkOfftopic') as InjectionKey<Ref<boolean>>,

  /** Whether threaded sub-replies are expanded */
  showThreadReplies: Symbol('showThreadReplies') as InjectionKey<Ref<boolean>>,

  /**
   * Whether the thread-level NSFW overlay has been dismissed.
   * Provided by both Discussion.vue and pages/forum/[id].vue.
   * Using a shared typed key prevents the string collision between the two providers.
   */
  threadNsfwRevealed: Symbol('thread-nsfw-revealed') as InjectionKey<Ref<boolean>>,
} as const
