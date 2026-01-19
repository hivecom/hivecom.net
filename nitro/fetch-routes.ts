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

  const fetchIds = async (table: string, routePrefix: string) => {
    try {
      // Using REST API directly to avoid instantiating a full Supabase client in the config
      const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=id`, {
        headers,
      })

      if (!response.ok) {
        throw new Error(`Supabase API returned ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as { id: string | number }[]

      if (Array.isArray(data)) {
        const tableRoutes = data.map(item => `${routePrefix}/${item.id}`)
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
    fetchIds('events', '/events'),
    fetchIds('projects', '/community/projects'),
    fetchIds('discussions', '/forum'),
    fetchIds('gameservers', '/servers/gameservers'),
    fetchIds('announcements', '/announcements'),
  ])

  return routes
}
