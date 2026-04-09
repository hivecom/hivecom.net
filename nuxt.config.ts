import type { SitemapUrl } from './nitro/fetch-routes'
import { fileURLToPath } from 'node:url'
import process from 'process'
import fetchRoutes from './nitro/fetch-routes'

// Only fetch routes when actually building/generating — not during `nuxi prepare`, type-gen, etc.
const isBuildCommand = process.argv.some(arg => ['build', 'generate'].includes(arg))

// Cache the fetch result so it's only called once across hooks
let fetchRoutesCache: Promise<{ routes: string[], sitemapUrls: SitemapUrl[] }> | null = null
async function getCachedRoutes() {
  fetchRoutesCache ??= fetchRoutes()
  return fetchRoutesCache
}

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  routeRules: {
    '/admin/**': { ogImage: false },
    '/auth/**': { ogImage: false },
    '/profile/**': { ogImage: false },
    '/playground/**': { ogImage: false },
    '/votes/**': { ogImage: false },
  },
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
    enabled: false,
  },
  components: false,
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
      sizeLimitKb: 512,
      // Icons referenced dynamically (via :name binding from JS objects/constants) -
      // can't be statically scanned from templates, so must be explicitly included.
      icons: [
        // constants.json PLATFORMS (index.vue join section)
        'ph:chats-circle-bold',
        'ph:play-circle-bold',
        'mdi:teamspeak',

        // constants.json LINKS (Footer.vue social links)
        'mdi:discord',
        'mdi:github',
        'mdi:code',
        'mdi:steam',
        'mdi:twitch',

        // lib/navigation.ts (Navigation.vue mobile menu)
        'ph:house',
        'ph:users',
        'ph:calendar',
        'ph:chats-circle',
        'ph:game-controller',
        'ph:check-square',

        // layouts/admin.vue sidebar menu items
        'ph:squares-four',
        'ph:images-square',
        'ph:flag',
        'ph:chat-circle',
        'ph:calendar-blank',
        'ph:coins',
        'ph:database',
        'ph:speaker-simple-high',
        'ph:computer-tower',
        'ph:folder',
        'ph:user-sound',
        'ph:user',

        // Admin/Alerts.vue
        'ph:warning-circle',
        'ph:calendar-x',
        'ph:warning-octagon',

        // Admin/Complaints (ComplaintCard.vue, ComplaintDetails.vue)
        'ph:bell',
        'ph:check-circle',
        'ph:chat-circle-dots',
        'ph:question',
        'ph:chat-circle-text',
        'ph:chats',

        // Admin/Discussions/DiscussionDetails.vue context links
        'ph:user-circle',

        // Admin/Network/GameServerTable.vue
        'ph:cube',

        // Admin/Users/UserTable.vue provider + platform icons
        'ph:google-logo',
        'ph:discord-logo',
        'ph:envelope-simple',
        'ph:identification-card',
        'ph:steam-logo',
        'ph:patreon-logo',

        // Editor/RichTextSelectionMenu.vue
        // (static string names in <Icon> - included explicitly to guarantee bundle inclusion)
        'ph:text-h-one',
        'ph:x',
        'ph:text-b',
        'ph:text-italic',
        'ph:text-underline',
        'ph:text-strikethrough',
        'ph:code',
        'ph:paint-bucket',
        'ph:text-aa',
        'ph:list-bullets',
        'ph:list-numbers',
        'ph:code-block',
        'ph:quotes',
        'material-symbols-light:lowercase',

        // Community/FundingHistory.vue growth indicators
        'ph:minus',
        'ph:trend-up',
        'ph:trend-down',

        // pages/servers/gameservers/[id].vue state configs
        'ph:check-circle-fill',
        'ph:play-circle-fill',
        'ph:warning-circle-fill',
        'ph:x-circle-fill',
        'ph:question-fill',

        // events
        'ph:arrows-vertical',

        // Discussions/DiscussionTimeline.vue jump-to-date button + toolbar
        'ph:clock',
        'ph:arrow-down',
        'ph:arrow-up',

        // Profile/Banner editor
        'ph:arrows-out',
        'ph:circle-half-tilt',
        'ph:copy',
        'ph:floppy-disk',
        'ph:folder-open',
        'ph:frame-corners',
        'ph:image',
        'ph:pencil-simple',
        'ph:plus',
        'ph:selection-foreground',
        'ph:text-t',
        'ph:trash',

        // Global search + searches
        'ph:magnifying-glass',
        'ph:list-magnifying-glass',
      ],
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
      // NOTE: rehype-sanitize is configured in mdc.config.ts instead of here.
      // nuxt.config.ts options are passed through JSON.stringify when generating
      // .nuxt/mdc-imports.mjs, which silently converts every RegExp to {} —
      // causing the iframe src allow-list to reject all YouTube embeds.
      // mdc.config.ts is loaded as a real ES module so RegExp values survive.
    },
  },
  vite: {
    build: {
      rollupOptions: {
        // consola imports node:tty for its terminal reporter; it's safely
        // externalized by Vite and has no effect in the browser. Suppress
        // the spurious warning so build output stays readable.
        onwarn(warning, warn) {
          if (warning.code === 'MODULE_LEVEL_DIRECTIVE')
            return
          if (
            warning.code === 'PLUGIN_WARNING'
            && warning.message.includes('node:tty')
          ) {
            return
          }
          warn(warning)
        },
      },
    },
    optimizeDeps: {
      include: [
        'debug', // CJS
        '@dolanske/vui',
        'dayjs', // CJS
        'dayjs/plugin/relativeTime', // CJS
        '@dolanske/v-valid',
        '@tiptap/core',
        '@tiptap/extension-details',
        '@tiptap/extension-image',
        '@tiptap/extension-mathematics',
        '@tiptap/extension-table/cell',
        '@tiptap/extension-table/header',
        '@tiptap/extension-table/row',
        '@tiptap/extension-table/table',
        '@tiptap/extension-task-item',
        '@tiptap/extension-task-list',
        '@tiptap/extension-youtube',
        '@tiptap/extensions',
        '@tiptap/markdown',
        '@tiptap/pm/state',
        '@tiptap/starter-kit',
        '@tiptap/vue-3',
        'marked',
        '@tiptap/vue-3/menus',
        '@tiptap/pm/view',
        '@tiptap/extension-mention',
        '@floating-ui/dom',
      ],
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
    exclude: ['/admin/**', '/auth/**', '/playground/**', '/votes/**'],
    urls: async () => {
      if (!isBuildCommand) {
        return []
      }
      const { sitemapUrls } = await getCachedRoutes()
      return sitemapUrls
    },
  },
  hooks: {
    'nitro:config': async (nitroConfig) => {
      if (!isBuildCommand) {
        return
      }

      const { routes } = await getCachedRoutes()
      if (nitroConfig.prerender && nitroConfig.prerender.routes) {
        nitroConfig.prerender.routes.push(...routes)
      }
    },
  },
  ogImage: {
    // This is a fully prerendered static site (github-pages), so all OG images
    // are generated at build time. Zero runtime mode removes all renderer code
    // from the Nitro output and eliminates the "Unknown Nitro preset" warning.
    zeroRuntime: true,
  },
  nitro: {
    // Explicitly set static: true so nuxt-og-image's resolveOgImagePreset()
    // sees nuxt.options.nitro.static and returns "nitro-prerender" instead of
    // falling through to resolveNitroPreset() with an unknown preset name.
    static: true,
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
