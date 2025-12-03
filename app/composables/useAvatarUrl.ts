/**
 * Composable for getting user avatar URLs from storage
 */

import type { Ref } from 'vue'
import type { Database } from '@/types/database.types'
import { readonly, ref, unref, watchEffect } from 'vue'
import { getUserAvatarUrl } from '@/lib/storage'

/**
 * Reactive composable for fetching user avatar URLs
 * @param userId - The user ID to fetch the avatar for
 * @returns Object with avatarUrl ref and fetch function
 */
export function useAvatarUrl(userId: string | Ref<string | null | undefined>) {
  const avatarUrl = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const fetchAvatarUrl = async () => {
    const id = unref(userId)
    if (id === null || id === undefined || id.trim() === '') {
      avatarUrl.value = null
      return
    }

    loading.value = true
    error.value = null

    try {
      const supabase = useSupabaseClient<Database>()
      avatarUrl.value = await getUserAvatarUrl(supabase, id)
    }
    catch (err) {
      console.error('Error fetching avatar URL:', err)
      error.value = err instanceof Error ? err.message : 'Failed to fetch avatar'
      avatarUrl.value = null
    }
    finally {
      loading.value = false
    }
  }

  // Auto-fetch on userId change
  watchEffect(() => {
    void fetchAvatarUrl()
  })

  return {
    avatarUrl: readonly(avatarUrl),
    loading: readonly(loading),
    error: readonly(error),
    refetch: fetchAvatarUrl,
  }
}
