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
    getEntry: (item: T) => { route: string, lastmod: string, extraRoutes?: string[], skipSitemap?: boolean },
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
          const { route, lastmod, extraRoutes, skipSitemap } = getEntry(item)

          // Always add the canonical route to prerender.
          routes.push(route)

          // Only add to sitemap if not explicitly skipped.
          // Sitemap URLs get a trailing slash to match what GitHub Pages actually serves,
          // avoiding the 301 redirect that Google would otherwise follow.
          if (skipSitemap !== true) {
            sitemapUrls.push({ loc: route.endsWith('/') ? route : `${route}/`, lastmod })
          }

          // Extra routes (e.g. UUID aliases) go into prerender only - never the sitemap.
          // This ensures old UUID-based URLs that Google or external sites have cached
          // resolve to a real HTML file instead of a hard 404. The SPA then does a
          // client-side redirect to the canonical URL.
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

    // Pre-render all discussions that have a discussion_topic_id. This covers pure forum
    // threads and any entity-linked discussion that has been assigned a topic. Discussions
    // without a topic redirect to their parent entity and should not be indexed.
    //
    // When a discussion has a slug, the slug is the canonical URL (goes into both prerender
    // and sitemap). The UUID is also prerendered as an alias so that old links from Google
    // or external sites resolve to a real HTML file instead of a hard 404 - the SPA then
    // does a client-side redirect to the canonical slug URL.
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
            // UUID alias: prerender only, not in sitemap
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

    // Also prerender UUID routes for entity-linked discussions that have no topic
    // (null discussion_topic_id). These are not indexed - they redirect client-side
    // to their parent entity page - but they need a real HTML file so GitHub Pages
    // doesn't serve a hard 404 to crawlers that have old UUID links cached.
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
      'gameservers',
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
