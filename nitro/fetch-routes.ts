import process from 'node:process'

export interface SitemapUrl {
  loc: string
  lastmod: string
}

export interface FetchRoutesResult {
  routes: string[]
  sitemapUrls: SitemapUrl[]
}

/**
 * Fetches dynamic routes from Supabase for pre-rendering and sitemap generation.
 * This is used in nuxt.config.ts to populate nitro.prerender.routes and sitemap.urls.
 */
export default async function fetchRoutes(): Promise<FetchRoutesResult> {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_KEY

  if (!supabaseUrl || !supabaseKey) { // eslint-disable-line ts/strict-boolean-expressions
    // Only warn if we're in a CI/production build where these should be present.
    // In dev, we might not care about pre-rendering everything.
    if (process.env.NODE_ENV === 'production') {
      console.warn('SUPABASE_URL or SUPABASE_KEY is missing. Skipping dynamic route fetching.')
    }
    return { routes: [], sitemapUrls: [] }
  }

  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
  }

  const routes: string[] = []
  const sitemapUrls: SitemapUrl[] = []

  const fetchIds = async <T extends { id: string | number, created_at: string, modified_at?: string | null }>(
    table: string,
    select: string,
    getEntry: (item: T) => { route: string, lastmod: string },
    filter?: string,
  ) => {
    try {
      const query = filter != null
        ? `${supabaseUrl}/rest/v1/${table}?select=${select}&${filter}`
        : `${supabaseUrl}/rest/v1/${table}?select=${select}`

      // Using REST API directly to avoid instantiating a full Supabase client in the config
      const response = await fetch(query, {
        headers,
      })

      if (!response.ok) {
        throw new Error(`Supabase API returned ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as T[]

      if (Array.isArray(data)) {
        for (const item of data) {
          const { route, lastmod } = getEntry(item)
          routes.push(route)
          sitemapUrls.push({ loc: route, lastmod })
        }
        // eslint-disable-next-line no-console
        console.log(`✔ Added ${data.length} routes from ${table}`)
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
    fetchIds<{ id: number, created_at: string, modified_at: string | null }>(
      'events',
      'id,created_at,modified_at',
      item => ({
        route: `/events/${item.id}`,
        lastmod: item.modified_at ?? item.created_at,
      }),
    ),

    fetchIds<{ id: number, created_at: string, modified_at: string | null }>(
      'projects',
      'id,created_at,modified_at',
      item => ({
        route: `/community/projects/${item.id}`,
        lastmod: item.modified_at ?? item.created_at,
      }),
    ),

    // Exclude profile-associated discussions (profile_id IS NOT NULL)
    fetchIds<{ id: string, slug: string | null, created_at: string, modified_at: string }>(
      'discussions',
      'id,slug,created_at,modified_at',
      (item) => {
        const discussionSlug = item.slug?.trim()
        const slugOrId = (discussionSlug !== undefined && discussionSlug.length > 0)
          ? discussionSlug
          : item.id
        return {
          route: `/forum/${slugOrId}`,
          lastmod: item.modified_at,
        }
      },
      'profile_id=is.null',
    ),

    fetchIds<{ id: number, created_at: string, modified_at: string | null }>(
      'gameservers',
      'id,created_at,modified_at',
      item => ({
        route: `/servers/gameservers/${item.id}`,
        lastmod: item.modified_at ?? item.created_at,
      }),
    ),
  ])

  return { routes, sitemapUrls }
}
