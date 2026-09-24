import type { InjectionKey, Ref } from 'vue'
import type { Tables } from '@/types/database.overrides'

export type RefreshTopicIconFn = (id: string) => Promise<void>

export const FORUM_KEYS = {
  /** A factory, so the ref isn't unwrapped prematurely */
  forumTopics: Symbol('forumTopics') as InjectionKey<() => Ref<Tables<'discussion_topics'>[]>>,

  /** A factory, for the same reason as forumTopics */
  forumActiveTopicId: Symbol('forumActiveTopicId') as InjectionKey<() => Ref<string | null>>,

  /** Call after uploading or deleting a topic icon so the forum list updates */
  forumRefreshTopicIcon: Symbol('forumRefreshTopicIcon') as InjectionKey<RefreshTopicIconFn>,
} as const
