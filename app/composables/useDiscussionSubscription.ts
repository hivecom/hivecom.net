import type { Ref } from 'vue'
import type { SubscriptionRow } from '@/composables/useDiscussionSubscriptionsCache'
import type { Database } from '@/types/database.types'
import { computed, ref, watch } from 'vue'
import { SUBSCRIPTION_SELECT, useDiscussionSubscriptionsCache } from '@/composables/useDiscussionSubscriptionsCache'

// Status is fetched whenever the id or user changes while enabled is true.
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

    // Status cache first, so a page visit doesn't cost a DB round trip.
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
        .select(SUBSCRIPTION_SELECT)
        .single()

      if (!error && data) {
        // Patch the list and status caches so the notification sheet shows the
        // new subscription without a refetch.
        isSubscribed.value = true
        subscriptionsCache.applySubscribe(userId.value, data as unknown as SubscriptionRow)
      }
      else if (!error) {
        // The insert worked but .single() returned no row, so only the status changes.
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
