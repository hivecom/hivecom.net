import type { InjectionKey, Ref } from 'vue'
import type { Comment, DiscussionSettings, ProvidedDiscussion, RawComment } from './Discussion.types'

export const DISCUSSION_KEYS = {
  loadChildren: Symbol('loadChildren') as InjectionKey<(rootId: string) => Promise<void>>,

  /** Comment ID whose DiscussionItem should open its replies sheet */
  openThreadSheet: Symbol('openThreadSheet') as InjectionKey<Ref<string | null>>,

  childrenMap: Symbol('childrenMap') as InjectionKey<Ref<Map<string, RawComment[]>>>,

  /** Loads the comment's page if needed */
  navigateToComment: Symbol('navigateToComment') as InjectionKey<(id: string) => Promise<boolean>>,

  /** Direct non-deleted child counts, fetched at load so flat view has them before children load */
  replyCountMap: Symbol('replyCountMap') as InjectionKey<Ref<Map<string, number>>>,
  viewMode: Symbol('viewMode') as InjectionKey<Ref<'flat' | 'threaded'>>,

  /** Admins and moderators */
  canBypassLock: Symbol('canBypassLock') as InjectionKey<Ref<boolean>>,

  setReplyToComment: Symbol('setReplyToComment') as InjectionKey<(comment: Comment) => void>,

  setQuoteOfComment: Symbol('setQuoteOfComment') as InjectionKey<(comment: Comment) => void>,

  toggleOfftopic: Symbol('toggleOfftopic') as InjectionKey<(comment: Comment) => Promise<void>>,

  /** Soft delete */
  deleteComment: Symbol('delete-comment') as InjectionKey<(id: string) => Promise<unknown>>,

  /** Admin only. Hard DELETE. */
  forceDeleteComment: Symbol('force-delete-comment') as InjectionKey<(id: string) => Promise<unknown>>,

  discussion: Symbol('discussion') as InjectionKey<ProvidedDiscussion>,

  discussionSettings: Symbol('discussion-settings') as InjectionKey<DiscussionSettings>,

  showOfftopic: Symbol('showOfftopic') as InjectionKey<Ref<boolean>>,

  canMarkOfftopic: Symbol('canMarkOfftopic') as InjectionKey<Ref<boolean>>,

  /** Whether threaded sub-replies are expanded */
  showThreadReplies: Symbol('showThreadReplies') as InjectionKey<Ref<boolean>>,

  /** Whether the thread NSFW overlay was dismissed. Discussion.vue and pages/forum/[id].vue both provide it. */
  threadNsfwRevealed: Symbol('thread-nsfw-revealed') as InjectionKey<Ref<boolean>>,
} as const
