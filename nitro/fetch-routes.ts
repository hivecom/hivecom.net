import process from 'node:process'

export interface SitemapUrl {
  loc: string
  lastmod: string
}

export interface FetchRoutesResult {
  routes: string[]
  sitemapUrls: SitemapUrl[]
}

export default async function fetchRoutes(): Promise<FetchRoutesResult> {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY is missing. Skipping dynamic route fetching.')
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
    getEntry: (item: T) => { route: string, lastmod: string, extraRoutes?: string[], skipSitemap?: boolean },
    filter?: string,
  ) => {
    try {
      const query = filter != null
        ? `${supabaseUrl}/rest/v1/${table}?select=${select}&${filter}`
        : `${supabaseUrl}/rest/v1/${table}?select=${select}`

      // Plain REST so the config doesn't instantiate a Supabase client
      const response = await fetch(query, {
        headers,
      })

      if (!response.ok) {
        throw new Error(`Supabase API returned ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as T[]

      if (Array.isArray(data)) {
        for (const item of data) {
          const { route, lastmod, extraRoutes, skipSitemap } = getEntry(item)

          routes.push(route)

          // Trailing slash matches what GitHub Pages serves, avoiding a 301 for crawlers
          if (skipSitemap !== true) {
            sitemapUrls.push({ loc: route.endsWith('/') ? route : `${route}/`, lastmod })
          }

          // Extra routes are prerender-only aliases so old cached URLs get a real
          // HTML file instead of a 404. The SPA then redirects to the canonical URL.
          if (extraRoutes != null) {
            for (const extra of extraRoutes) {
              routes.push(extra)
            }
          }
        }
        // eslint-disable-next-line no-console
        console.log(`✔ Added ${data.length} routes from ${table}`)
      }
    }
    catch (error) {
      console.error(`❌ Failed to fetch routes for ${table}:`, error)
    }
  }

  await Promise.all([
    fetchIds<{ id: number, created_at: string, modified_at: string | null, is_official: boolean }>(
      'events',
      'id,created_at,modified_at,is_official',
      item => ({
        route: `/events/${item.id}`,
        lastmod: item.modified_at ?? item.created_at,
        skipSitemap: !item.is_official,
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

    // Only discussions with a topic are indexed. Topicless ones redirect to their
    // parent entity. A slug, when set, is the canonical URL.
    fetchIds<{ id: string, slug: string | null, created_at: string, modified_at: string }>(
      'discussions',
      'id,slug,created_at,modified_at',
      (item) => {
        const discussionSlug = item.slug?.trim()
        const hasSlug = discussionSlug !== undefined && discussionSlug.length > 0

        if (hasSlug) {
          return {
            route: `/forum/${discussionSlug}`,
            lastmod: item.modified_at,
            extraRoutes: [`/forum/${item.id}`],
          }
        }

        return {
          route: `/forum/${item.id}`,
          lastmod: item.modified_at,
        }
      },
      'discussion_topic_id=not.is.null&is_draft=eq.false&is_nsfw=eq.false',
    ),

    // Topicless discussions aren't indexed, but crawlers with old UUID links still
    // need a real HTML file instead of a GitHub Pages 404
    fetchIds<{ id: string, created_at: string, modified_at: string }>(
      'discussions',
      'id,created_at,modified_at',
      item => ({
        route: `/forum/${item.id}`,
        lastmod: item.modified_at,
        skipSitemap: true,
      }),
      'discussion_topic_id=is.null&is_draft=eq.false',
    ),

    fetchIds<{ id: number, created_at: string, modified_at: string | null }>(
      'network_gameservers',
      'id,created_at,modified_at',
      item => ({
        route: `/servers/gameservers/${item.id}`,
        lastmod: item.modified_at ?? item.created_at,
      }),
    ),

    fetchIds<{ id: string, username: string, created_at: string, modified_at: string | null }>(
      'profiles',
      'id,username,created_at,modified_at',
      item => ({
        route: `/profile/${item.username}`,
        lastmod: item.modified_at ?? item.created_at,
      }),
      'public=eq.true',
    ),
  ])

  return { routes, sitemapUrls }
}
