/**
 * Typed InjectionKey symbols for the Forum page's provide/inject pairs.
 *
 * Replaces the bare-string provide/inject pattern in pages/forum/index.vue
 * and components/Forum/ForumModalAddDiscussion.vue.
 *
 * Usage:
 *   // Provider (pages/forum/index.vue):
 *   import { FORUM_KEYS } from '@/components/Forum/Forum.keys'
 *   provide(FORUM_KEYS.forumTopics, () => topics)
 *
 *   // Consumer (ForumModalAddDiscussion.vue):
 *   import { FORUM_KEYS } from '@/components/Forum/Forum.keys'
 *   const injectedTopics = inject(FORUM_KEYS.forumTopics, () => ref([]))()
 */

import type { InjectionKey, Ref } from 'vue'
import type { Tables } from '@/types/database.overrides'

export type RefreshTopicIconFn = (id: string) => Promise<void>

export const FORUM_KEYS = {
  /**
   * Factory returning the forum topics list ref.
   * Provided as a function to avoid unwrapping the ref prematurely.
   */
  forumTopics: Symbol('forumTopics') as InjectionKey<() => Ref<Tables<'discussion_topics'>[]>>,

  /**
   * Factory returning the currently active topic ID ref.
   * Provided as a function for the same reason as forumTopics.
   */
  forumActiveTopicId: Symbol('forumActiveTopicId') as InjectionKey<() => Ref<string | null>>,

  /**
   * Refreshes the cached icon for a single topic in the bulk icon map.
   * Call after uploading or deleting a topic icon so the forum list updates immediately.
   */
  forumRefreshTopicIcon: Symbol('forumRefreshTopicIcon') as InjectionKey<RefreshTopicIconFn>,
} as const
