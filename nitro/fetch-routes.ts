import process from 'node:process'

/**
 * Fetches dynamic routes from Supabase for pre-rendering.
 * This is used in nuxt.config.ts to populate nitro.prerender.routes.
 */
export default async function fetchRoutes(): Promise<string[]> {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_KEY

  if (!supabaseUrl || !supabaseKey) { // eslint-disable-line ts/strict-boolean-expressions
    // Only warn if we're in a CI/production build where these should be present.
    // In dev, we might not care about pre-rendering everything.
    if (process.env.NODE_ENV === 'production') {
      console.warn('SUPABASE_URL or SUPABASE_KEY is missing. Skipping dynamic route fetching.')
    }
    return []
  }

  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
  }

  const routes: string[] = []

  const fetchIds = async <T extends { id: string | number }>(
    table: string,
    select: string,
    getRoute: (item: T) => string,
  ) => {
    try {
      // Using REST API directly to avoid instantiating a full Supabase client in the config
      const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=${select}`, {
        headers,
      })

      if (!response.ok) {
        throw new Error(`Supabase API returned ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as T[]

      if (Array.isArray(data)) {
        const tableRoutes = data.map(item => getRoute(item))
        routes.push(...tableRoutes)
        // eslint-disable-next-line no-console
        console.log(`✔ Added ${tableRoutes.length} routes from ${table}`)
      }
    }
    catch (error) {
      console.error(`❌ Failed to fetch routes for ${table}:`, error)
    }
  }

  // Fetch all dynamic content types
  // Note: We are fetching IDs for all items to generate static pages for them.
  // This allows crawlers to index these pages even though we are an SPA.
  await Promise.all([
    fetchIds<{ id: string | number }>('events', 'id', item => `${'/events'}/${item.id}`),
    fetchIds<{ id: string | number }>('projects', 'id', item => `${'/community/projects'}/${item.id}`),
    fetchIds<{ id: string | number, slug: string | null }>(
      'discussions',
      'id,slug',
      (item) => {
        const discussionSlug = item.slug?.trim()
        let slugOrId = item.id
        if (discussionSlug !== undefined && discussionSlug.length > 0) {
          slugOrId = discussionSlug
        }
        return `${'/forum'}/${slugOrId}`
      },
    ),
    fetchIds<{ id: string | number }>('gameservers', 'id', item => `${'/servers/gameservers'}/${item.id}`),
  ])

  return routes
}
