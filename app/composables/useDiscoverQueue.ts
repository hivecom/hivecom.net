import type { Component } from 'vue'
import type { Database } from '@/types/database.types'
import { pushToast, removeToast } from '@dolanske/vui'

import ToastBodyRandomDiscussion from '@/components/Toast/ToastBodyRandomDiscussion.vue'

type DiscoverResult = Database['public']['Functions']['get_random_forum_discussion']['Returns'][number]

// Module-level state persists for the page session
const seenIds = new Set<string>()
const activeToastId = ref<number | null>(null)

export function useDiscoverQueue() {
  const supabase = useSupabaseClient<Database>()

  async function navigate(currentToastId?: number) {
    if (currentToastId != null) {
      removeToast(currentToastId)
      activeToastId.value = null
    }

    const { data, error } = await supabase.rpc('get_random_forum_discussion')
    if (error != null || data == null || data.length === 0)
      return

    const unseen = data.filter((d: DiscoverResult) => !seenIds.has(d.id))
    const pool: DiscoverResult[] = unseen.length > 0 ? unseen : data

    const picked = pool[Math.floor(Math.random() * pool.length)]
    if (picked == null)
      return

    seenIds.add(picked.id)

    await navigateTo(`/forum/${picked.slug ?? picked.id}`)

    const toastId = pushToast('', {
      persist: true,
      body: ToastBodyRandomDiscussion as Component,
      bodyProps: {
        title: picked.title ?? 'Random discussion',
        onNext: (id: number) => {
          void navigate(id)
        },
      },
    })

    activeToastId.value = toastId.id
  }

  return { navigate }
}
