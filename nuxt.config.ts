import type { SitemapUrl } from './nitro/fetch-routes'
import { fileURLToPath } from 'node:url'
import process from 'process'
import { defaultSchema } from 'rehype-sanitize'
import fetchRoutes from './nitro/fetch-routes'

// Cache the fetch result so it's only called once across hooks
let fetchRoutesCache: Promise<{ routes: string[], sitemapUrls: SitemapUrl[] }> | null = null
async function getCachedRoutes() {
  fetchRoutesCache ??= fetchRoutes()
  return fetchRoutesCache
}

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  alias: {
    '@': fileURLToPath(new URL('./app', import.meta.url)),
    '~': fileURLToPath(new URL('.', import.meta.url)),
    '~~': fileURLToPath(new URL('.', import.meta.url)),
  },
  app: {
    head: {
      link: [
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
        { rel: 'manifest', href: '/manifest.json' },
      ],
      meta: [
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
      ],
    },
    pageTransition: {
      name: 'page',
    },
    // layoutTransition: {
    //   name: 'layout',
    //   mode: 'out-in',
    // },
  },
  devtools: {
    enabled: true,

    timeline: {
      enabled: true,
    },
  },
  compatibilityDate: '2024-09-25',
  typescript: {
    typeCheck: false,
  },
  modules: [
    '@nuxtjs/supabase',
    '@nuxtjs/sitemap',
    '@nuxtjs/robots',
    '@nuxtjs/seo',
    '@nuxt/content',
    '@nuxt/image',
    '@nuxt/icon',
    'nuxt-og-image',
    '@pinia/nuxt',
    '@vueuse/nuxt',
    '@nuxtjs/mdc',
    '@yuta-inoue-ph/nuxt-vcalendar',
  ],
  icon: {
    serverBundle: 'remote',
    clientBundle: {
      scan: true,
      sizeLimitKb: 256,
    },
  },
  css: [
    '@/assets/index.scss',
    'katex/dist/katex.min.css',
  ],
  mdc: {
    remarkPlugins: {
      'remark-math': {},
    },
    rehypePlugins: {
      'rehype-katex': {
        options: {
          throwOnError: false,
          output: 'html',
        },
      },
      // Sanitize HTML after rehype-raw and rehype-katex have run so that any
      // raw HTML that survived the markdown pipeline (YouTube iframes, color
      // spans, KaTeX output) is still allowed, while arbitrary user-injected
      // tags (<script>, event handlers, etc.) are stripped.
      'rehype-sanitize': {
        options: {
          ...defaultSchema,
          // Allow YouTube iframes produced by processYoutubeDirectives.
          // Only youtube-nocookie.com src values are permitted; all other
          // iframe attributes are locked down.
          tagNames: [
            ...(defaultSchema.tagNames ?? []),
            'iframe',
            // KaTeX emits <svg>, <path>, <line>, <use> for some output modes
            'svg',
            'path',
            'line',
            'use',
          ],
          attributes: {
            ...defaultSchema.attributes,
            // span: allow class (KaTeX uses many class names) and style
            // restricted to color only (processColorTags emits inline color).
            // We deliberately do NOT use a wildcard allowlist for style values
            // so that only safe CSS properties can pass through.
            'span': [
              ...(defaultSchema.attributes?.span ?? []),
              'className',
              'style',
              'ariaHidden',
            ],
            // div: allow class and style for KaTeX block wrappers
            'div': [
              ...(defaultSchema.attributes?.div ?? []),
              'className',
              'style',
            ],
            // iframe: locked to YouTube nocookie embeds only
            'iframe': [
              ['src', /^https:\/\/www\.youtube-nocookie\.com\/embed\//],
              'width',
              'height',
              'frameborder',
              'allow',
              'allowfullscreen',
              'className',
            ],
            // SVG elements for KaTeX
            'svg': ['xmlns', 'width', 'height', 'viewBox', 'className', 'style', 'ariaHidden', 'focusable'],
            'path': ['d', 'stroke', 'strokeWidth', 'fill', 'className'],
            'line': ['x1', 'y1', 'x2', 'y2', 'stroke', 'strokeWidth', 'className'],
            'use': [['href', /^#/], ['xlinkHref', /^#/], 'className'],
            // Allow class on any element for KaTeX and highlight.js
            '*': ['className'],
          },
        },
      },
    },
  },
  vite: {
    optimizeDeps: {
      include: ['debug'],
    },
  },
  runtimeConfig: {
    public: {
      patreonClientId: process.env.NUXT_PUBLIC_AUTH_EXTERNAL_PATREON_CLIENT_ID ?? '',
      baseUrl: process.env.NUXT_PUBLIC_BASE_URL ?? 'https://hivecom.net',
      supabaseProjectRef: process.env.NUXT_PUBLIC_SUPABASE_PROJECT_REF ?? '',
    },
  },
  robots: {
    sitemap: [
      `${process.env.NUXT_PUBLIC_BASE_URL ?? 'https://hivecom.net'}/sitemap.xml`,
    ],
    groups: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/admin/', '/auth', '/auth/', '/playground', '/playground/', '/profile', '/profile/', '/votes', '/votes/'],
      },
    ],
  },
  sitemap: {
    zeroRuntime: true,
    exclude: ['/admin/**', '/auth/**', '/playground/**', '/profile/**', '/votes/**'],
    urls: async () => {
      if (process.env.NODE_ENV !== 'production') {
        return []
      }
      const { sitemapUrls } = await getCachedRoutes()
      return sitemapUrls
    },
  },
  hooks: {
    'nitro:config': async (nitroConfig) => {
      if (process.env.NODE_ENV !== 'production') {
        return
      }

      const { routes } = await getCachedRoutes()
      if (nitroConfig.prerender && nitroConfig.prerender.routes) {
        nitroConfig.prerender.routes.push(...routes)
      }
    },
  },
  nitro: {
    prerender: {
      failOnError: false,
      crawlLinks: true,
      routes: ['/', '/robots.txt', '/sitemap.xml', '/llms.txt'],
    },
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
    types: '~~/types/database.types.ts',
    redirect: false, // It would make sense to have redirects based on the path, however due to SSR, this is not possible.
    redirectOptions: {
      login: '/auth/sign-in',
      callback: '/auth/confirm',
    },
    // types: './types/database.types.ts',
  },
  site: {
    url: process.env.NUXT_PUBLIC_BASE_URL ?? 'https://hivecom.net',
    name: 'Hivecom',
    title: 'Hivecom',
    description: 'A community of friends from all around the world, creating a space for everyone and projects to thrive. We host game servers, provide communication platforms, and foster collaboration through open source projects. Join us!',
    tags: [
      'community',
      'gameservers',
      'projects',
      'open source',
      'gaming',
      'irc',
      'teamspeak',
      'discord',
      'forum',
      'server network',
    ],
  },
})
