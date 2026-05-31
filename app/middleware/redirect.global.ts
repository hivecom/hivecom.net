import type { SupabaseClient } from '@supabase/supabase-js'
import type { ShortURL } from '@/lib/url-shortener'

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
    const { data, error } = await client.from('kvstore')
      .select('value')
      .eq('key', shortUrlId)
      .single<{ value: ShortURL }>()

    if (error || !data.value) {
      return navigateTo('/', { replace: true })
    }

    const result = data.value

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
