import type { Ref } from 'vue'
import type { SubscriptionRow } from '@/composables/useDiscussionSubscriptionsCache'
import type { Database } from '@/types/database.types'
import { computed, ref, watch } from 'vue'
import { useDiscussionSubscriptionsCache } from '@/composables/useDiscussionSubscriptionsCache'

/**
 * Subscribe / unsubscribe state for a single discussion.
 *
 * Owns the `isSubscribed` flag, the in-flight `subscriptionLoading` guard, the
 * status fetch (cache-first), and the toggle (which patches the status + list
 * caches so the notification sheet stays in sync without a re-fetch).
 *
 * Pass a reactive discussion id; status is fetched automatically whenever the id
 * (or the logged-in user) changes and `enabled` is true. `enabled` lets callers
 * gate it - e.g. the discussion component only subscribes in the comment model.
 */
export function useDiscussionSubscription(
  discussionId: Ref<string | null | undefined>,
  options?: { enabled?: Ref<boolean> | boolean },
) {
  const supabase = useSupabaseClient<Database>()
  const subscriptionsCache = useDiscussionSubscriptionsCache()
  const userId = useUserId()

  const isSubscribed = ref(false)
  const subscriptionLoading = ref(false)

  const enabled = computed(() => {
    const e = options?.enabled
    if (e == null)
      return true
    return typeof e === 'boolean' ? e : e.value
  })

  async function fetchSubscription(id: string) {
    if (!userId.value)
      return

    // Check status cache first - avoids a DB round-trip on every page visit.
    const cached = subscriptionsCache.getStatus(userId.value, id)
    if (cached !== null) {
      isSubscribed.value = cached
      return
    }

    const { data } = await supabase
      .from('discussion_subscriptions')
      .select('id')
      .eq('user_id', userId.value)
      .eq('discussion_id', id)
      .maybeSingle()

    isSubscribed.value = !!data
    subscriptionsCache.setStatus(userId.value, id, !!data)
  }

  async function toggleSubscription() {
    const id = discussionId.value
    if (!userId.value || !id || subscriptionLoading.value)
      return

    subscriptionLoading.value = true

    if (isSubscribed.value) {
      const { error } = await supabase
        .from('discussion_subscriptions')
        .delete()
        .eq('user_id', userId.value)
        .eq('discussion_id', id)

      if (!error) {
        isSubscribed.value = false
        subscriptionsCache.applyUnsubscribeByDiscussion(userId.value, id)
      }
    }
    else {
      const { data, error } = await supabase
        .from('discussion_subscriptions')
        .insert({ user_id: userId.value, discussion_id: id })
        .select('id, discussion_id, last_seen_at, discussion:discussions(title, slug, profile_id, event_id, gameserver_id, project_id, referendum_id, theme_id)')
        .single()

      if (!error && data) {
        // Patch the list + status caches so the notification sheet reflects the
        // new subscription without a re-fetch the next time it opens.
        isSubscribed.value = true
        subscriptionsCache.applySubscribe(userId.value, data as unknown as SubscriptionRow)
      }
      else if (!error) {
        // insert succeeded but .single() returned no data - just update status.
        isSubscribed.value = true
        subscriptionsCache.setStatus(userId.value, id, true)
      }
    }

    subscriptionLoading.value = false
  }

  watch(
    [discussionId, enabled, userId],
    ([id, on]) => {
      if (!on || !id || !userId.value)
        return
      void fetchSubscription(id)
    },
    { immediate: true },
  )

  return { isSubscribed, subscriptionLoading, toggleSubscription, fetchSubscription }
}
