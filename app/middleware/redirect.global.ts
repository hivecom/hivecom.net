import type { SupabaseClient } from '@supabase/supabase-js'
import { getShortURLObject } from '@/lib/url-shortener'

const getSupabaseClient = useSupabaseClient as () => SupabaseClient

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server)
    return

  if (to.path.startsWith('/b/')) {
    const shortUrlId = to.params.key

    if (!shortUrlId) {
      return navigateTo('/', { replace: true })
    }

    const client = getSupabaseClient()
    const result = await getShortURLObject(client, shortUrlId as string)

    if (!result) {
      return navigateTo('/', { replace: true })
    }

    // Update entry and increment access count
    await client.from('kvstore')
      .update({ value: { ...result, accessed: result.accessed + 1 } })
      .eq('key', shortUrlId)

    return navigateTo(result.link, {
      redirectCode: 307,
      external: true,
    })
  }
})
