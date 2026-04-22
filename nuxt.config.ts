import type { SitemapUrl } from './nitro/fetch-routes'
import { fileURLToPath } from 'node:url'
import process from 'process'
import monacoEditorPlugin from 'vite-plugin-monaco-editor'
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
      script: [
        {
          // Blocking inline script - runs synchronously before first paint to
          // restore the cached theme and light/dark mode from localStorage,
          // preventing any flash of the wrong theme/palette.
          innerHTML: `(function () {
  try {
    // 1. Restore light/dark mode (VUI stores this under 'vueuse-color-scheme')
    var scheme = localStorage.getItem('vueuse-color-scheme');
    var html = document.documentElement;
    if (scheme === 'light') {
      html.classList.remove('dark');
      html.classList.add('light');
    } else {
      // Default to dark
      html.classList.remove('light');
      html.classList.add('dark');
    }

    // 2. Restore custom theme palette from cache
    var raw = localStorage.getItem('hivecom-theme-cache');
    if (!raw) return;
    var theme = JSON.parse(raw);
    if (!theme || !theme.id) return;

    var style = html.style;

    // Color vars: DB columns like 'dark_bg_raised' -> '--dark-color-bg-raised'
    var colorKeys = [
      'bg','bg_medium','bg_raised','bg_lowered',
      'text','text_light','text_lighter','text_lightest','text_invert',
      'text_red','text_green','text_yellow','text_blue',
      'bg_red_lowered','bg_red_raised',
      'bg_green_lowered','bg_green_raised',
      'bg_yellow_lowered','bg_yellow_raised',
      'bg_blue_lowered','bg_blue_raised',
      'border','border_strong','border_weak',
      'button_gray','button_gray_hover','button_fill','button_fill_hover',
      'accent','bg_accent_lowered','bg_accent_raised'
    ];
    for (var i = 0; i < colorKeys.length; i++) {
      var k = colorKeys[i];
      for (var pi = 0; pi < 2; pi++) {
        var prefix = pi === 0 ? 'dark' : 'light';
        var col = prefix + '_' + k;
        if (theme[col] != null) {
          var varName = '--' + prefix + '-color-' + k.replace(/_/g, '-');
          style.setProperty(varName, theme[col]);
        }
      }
    }

    // Scale helpers
    function scaleVal(def, dbVal, minP, maxP) {
      var pct = minP + (dbVal / 100) * (maxP - minP);
      return def * (pct / 100);
    }

    // Spacing tokens (minPercent=0, maxPercent=200, defaultDb=50, unit=px)
    var spacingDefs = [
      ['--space-xxs', 4], ['--space-xs', 8], ['--space-s', 12],
      ['--space-m', 16], ['--space-l', 24], ['--space-xl', 34],
      ['--space-xxl', 48], ['--space-xxxl', 64]
    ];
    var spacingDb = theme.spacing != null ? theme.spacing : 50;
    for (var j = 0; j < spacingDefs.length; j++) {
      var scaled = scaleVal(spacingDefs[j][1], spacingDb, 0, 200);
      style.setProperty(spacingDefs[j][0], Math.round(scaled * 10) / 10 + 'px');
    }

    // Rounding tokens (minPercent=0, maxPercent=500, defaultDb=20, unit=px)
    var roundingDefs = [
      ['--border-radius-xs', 3], ['--border-radius-s', 5],
      ['--border-radius-m', 8], ['--border-radius-l', 12],
      ['--border-radius-pill', 99]
    ];
    var roundingDb = theme.rounding != null ? theme.rounding : 20;
    for (var j = 0; j < roundingDefs.length; j++) {
      var scaled = scaleVal(roundingDefs[j][1], roundingDb, 0, 500);
      style.setProperty(roundingDefs[j][0], Math.round(scaled * 10) / 10 + 'px');
    }

    // Transition tokens (minPercent=0, maxPercent=400, defaultDb=25, unit=s)
    var transitionDefs = [
      ['--transition-fast', 0.05, 'ease-in-out', '--transition-fast-duration'],
      ['--transition', 0.11, 'cubic-bezier(.65, 0, .35, 1)', '--transition-duration'],
      ['--transition-slow', 0.25, 'cubic-bezier(.65, 0, .35, 1)', '--transition-slow-duration']
    ];
    var transitionsDb = theme.transitions != null ? theme.transitions : 25;
    for (var j = 0; j < transitionDefs.length; j++) {
      var td = transitionDefs[j];
      var dur = scaleVal(td[1], transitionsDb, 0, 400);
      var durStr = Math.round(dur * 1000) / 1000 + 's';
      style.setProperty(td[0], durStr + ' all ' + td[2]);
      style.setProperty(td[3], durStr);
    }

    // Widening/container tokens (minPercent=100, maxPercent=300, defaultDb=0, unit=px)
    var containerDefs = [
      ['--container-xs', 360], ['--container-s', 728], ['--container-m', 968],
      ['--container-l', 1280], ['--container-xl', 1540], ['--container-xxl', 1920]
    ];
    var wideningDb = theme.widening != null ? theme.widening : 0;
    for (var j = 0; j < containerDefs.length; j++) {
      var scaled = scaleVal(containerDefs[j][1], wideningDb, 100, 300);
      style.setProperty(containerDefs[j][0], Math.round(scaled * 10) / 10 + 'px');
    }
  } catch (e) {
    // Never block the page on theme restore errors
  }
})();`,
          type: 'text/javascript',
          tagPriority: 'critical',
        },
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
    plugins: [
      monacoEditorPlugin({ languageWorkers: ['editorWorkerService', 'css'] }),
    ],
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
      // Caused call-stack exceeded errors
      exclude: [
        'monaco-editor',
      ],
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
