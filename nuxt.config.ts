import type { SitemapUrl } from './nitro/fetch-routes'
import { fileURLToPath } from 'node:url'
import process from 'process'
import fetchRoutes from './nitro/fetch-routes'

// Only fetch routes on build/generate. `nuxi prepare` and type-gen must not hit the network.
const isBuildCommand = process.argv.some(arg => ['build', 'generate'].includes(arg))

// Shared by the sitemap and prerender hooks so the fetch runs once
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
        // Declared explicitly so nuxt-seo-utils doesn't advertise every icon file
        // in public/. Keyed so app.vue's reactive favicon merges into this tag.
        { rel: 'icon', key: 'favicon', href: '/favicon.ico', type: 'image/x-icon' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
        { rel: 'manifest', href: '/manifest.json' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700&display=swap' },
      ],
      meta: [
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
      ],
      script: [
        {
          // Blocking inline script. It runs before first paint to restore the cached
          // theme and color mode, so there's no flash of the wrong palette.
          innerHTML: `(function () {
  try {
    // VUI stores the color mode under 'vueuse-color-scheme'
    var scheme = localStorage.getItem('vueuse-color-scheme');
    var html = document.documentElement;
    if (scheme === 'light') {
      html.classList.remove('dark');
      html.classList.add('light');
    } else {
      html.classList.remove('light');
      html.classList.add('dark');
    }

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
      'text_purple',
      'bg_purple_lowered','bg_purple_raised',
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

    function scaleVal(def, dbVal, minP, maxP) {
      var pct = minP + (dbVal / 100) * (maxP - minP);
      return def * (pct / 100);
    }

    // These ranges and defaults mirror the scale configs in app/lib/theme.ts
    // Spacing: minPercent=0, maxPercent=200, defaultDb=50, px
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

    // Rounding: minPercent=0, maxPercent=500, defaultDb=20, px
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

    // Transitions: minPercent=0, maxPercent=400, defaultDb=25, s
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

    // Widening: minPercent=100, maxPercent=300, defaultDb=0, px
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
        {
          // Vue-independent boot watchdog. If hydration crashes, the in-app escape
          // hatch in Loading.vue never starts and the SSR splash sits frozen. A
          // plain setTimeout still fires, so this offers a reload. 12s clears the
          // 8s self-recovery in Loading.vue, so only a real boot failure trips it.
          innerHTML: `(function () {
  try {
    // Count continuous foreground time only. Background tabs throttle timers and
    // defer hydration, so wall-clock time would flag loads that finish on refocus.
    var DELAY = 12000;
    var timer = null;
    var shown = false;

    function show() {
      timer = null;
      if (shown) return;
      // Overlay gone or fading out means the app booted
      if (!document.querySelector('.initial-loading:not(.fade-out)')) return;
      if (document.getElementById('boot-escape-hatch')) return;
      shown = true;

      var wrap = document.createElement('div');
      wrap.id = 'boot-escape-hatch';
      wrap.style.cssText = 'position:fixed;left:50%;bottom:34px;transform:translateX(-50%);z-index:10000;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;font-family:sans-serif;';

      var msg = document.createElement('p');
      msg.textContent = 'Taking longer than expected...';
      msg.style.cssText = 'margin:0;font-size:12px;color:var(--color-text-lighter,#888);';

      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;';

      var reload = document.createElement('button');
      reload.textContent = 'Reload';
      reload.style.cssText = 'cursor:pointer;border:0;border-radius:var(--border-radius-m,8px);padding:6px 14px;font-size:13px;background:var(--color-accent,#a3e635);color:#000;';
      reload.onclick = function () {
        // A plain reload() can be served the same stale HTML pointing at deleted
        // _nuxt chunks, so bust the cache with a query param.
        var loc = window.location;
        var sep = loc.search ? '&' : '?';
        loc.replace(loc.pathname + loc.search + sep + '_=' + Date.now() + loc.hash);
      };

      var support = document.createElement('a');
      support.textContent = 'Contact Support';
      support.href = 'mailto:contact@hivecom.net';
      support.style.cssText = 'display:inline-flex;align-items:center;border-radius:var(--border-radius-m,8px);padding:6px 14px;font-size:13px;color:var(--color-accent,#a3e635);text-decoration:none;';

      row.appendChild(reload);
      row.appendChild(support);
      wrap.appendChild(msg);
      wrap.appendChild(row);
      (document.body || document.documentElement).appendChild(wrap);
    }

    function arm() {
      if (shown || timer) return;
      timer = setTimeout(show, DELAY);
    }

    function disarm() {
      if (timer) { clearTimeout(timer); timer = null; }
    }

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') arm();
      else disarm();
    });

    if (document.visibilityState === 'visible') arm();
  } catch (e) {
    // Never let the watchdog itself break the page.
  }
})();`,
          type: 'text/javascript',
        },
      ],
    },
    pageTransition: {
      name: 'page',
    },
    // Nuxt keys the layout provider by name, so a layout swap tears down the
    // <NuxtPage> transition inside it. out-in because overlapping full-height
    // layouts stack vertically instead of over each other.
    layoutTransition: {
      name: 'layout',
      mode: 'out-in',
    },
  },
  devtools: {
    enabled: false,
  },
  unhead: {
    // nuxt-seo-utils turns on unhead's dev head validator with no per-rule
    // control. Everything it flags here is deliberate or comes from nuxt-og-image:
    // the inline head scripts, user-scalable=no, twitter:card. Only the validator
    // is off. The other transforms still run.
    vite: {
      validate: false,
    },
  },
  components: false,
  compatibilityDate: '2024-09-25',
  typescript: {
    typeCheck: false,
  },
  modules: [
    '@nuxt/fonts',
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
      // Icons bound dynamically through :name can't be scanned from templates
      icons: [
        'ph:chats-circle-bold',
        'ph:play-circle-bold',
        'mdi:teamspeak',

        'mdi:discord',
        'mdi:github',
        'mdi:code',
        'mdi:steam',
        'mdi:twitch',

        'ph:house',
        'ph:users',
        'ph:calendar',
        'ph:chats-circle',
        'ph:game-controller',
        'ph:check-square',

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

        'ph:warning-circle',
        'ph:calendar-x',
        'ph:warning-octagon',

        'ph:bell',
        'ph:check-circle',
        'ph:chat-circle-dots',
        'ph:question',
        'ph:chat-circle-text',
        'ph:chats',

        'ph:user-circle',

        'ph:cube',

        'ph:google-logo',
        'ph:discord-logo',

        'ph:telegram-logo',
        'simple-icons:matrix',
        'ph:envelope-simple',
        'ph:identification-card',
        'ph:steam-logo',
        'ph:patreon-logo',

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

        'ph:minus',
        'ph:trend-up',
        'ph:trend-down',

        'ph:check-circle-fill',
        'ph:play-circle-fill',
        'ph:warning-circle-fill',
        'ph:x-circle-fill',
        'ph:question-fill',

        'ph:arrows-vertical',
        'ph:download-simple',

        'ph:desktop-tower',
        'ph:blueprint',
        'ph:scales',
        'ph:chat-dots',
        'ph:paint-brush',

        'ph:clock',
        'ph:arrow-down',
        'ph:arrow-up',

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

        'ph:magnifying-glass',
        'ph:list-magnifying-glass',
        'ph:selection-slash',
        'ph:arrow-square-out',
      ],
    },
  },
  css: [
    '@/assets/index.scss',
    'katex/dist/katex.min.css',
  ],
  content: {
    experimental: {
      // node:sqlite instead of better-sqlite3
      sqliteConnector: 'native',
    },
  },
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
      // rehype-sanitize lives in app/mdc.config.ts. Options here go through
      // JSON.stringify, which turns every RegExp into {} and breaks the iframe
      // src allow-list.
    },
  },
  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: `@use '@/assets/breakpoints.scss' as *;\n`,
        },
      },
    },
    build: {
      rollupOptions: {
        // consola's node:tty import is externalized by Vite and harmless in the browser
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
        'globe.gl',
        'h3-js',
        'three',
        'three/examples/jsm/postprocessing/AfterimagePass.js',
        'three/examples/jsm/postprocessing/OutputPass.js',
        'three/examples/jsm/postprocessing/ShaderPass.js',
        'three/examples/jsm/postprocessing/UnrealBloomPass.js',
        'ansi-to-html', // CJS
        'jszip', // CJS
        'remark-math',
        'rehype-katex',
        'rehype-raw',
        'rehype-sanitize',
        'vue-advanced-cropper',
        'chart.js',
        'vue-chartjs',
        'chartjs-scale-timestack',
        'v-calendar',
        'diff',
        'diff2html',
        'minimark/stringify',
        '@unhead/schema-org/vue',
        '@shikijs/engine-oniguruma',
        '@shikijs/engine-javascript',
        '@shikijs/core',
        '@shikijs/transformers',
        '@shikijs/langs/javascript',
        '@shikijs/langs/jsx',
        '@shikijs/langs/json',
        '@shikijs/langs/typescript',
        '@shikijs/langs/tsx',
        '@shikijs/langs/vue',
        '@shikijs/langs/css',
        '@shikijs/langs/html',
        '@shikijs/langs/shellscript',
        '@shikijs/langs/markdown',
        '@shikijs/langs/mdc',
        '@shikijs/langs/yaml',
        '@shikijs/themes/github-light',
        '@shikijs/themes/github-dark',
        'shiki/wasm',
      ],
    },
  },
  runtimeConfig: {
    public: {
      patreonClientId: process.env.NUXT_PUBLIC_AUTH_EXTERNAL_PATREON_CLIENT_ID ?? '',
      baseUrl: process.env.NUXT_PUBLIC_BASE_URL ?? 'https://hivecom.net',
      supabaseProjectRef: process.env.NUXT_PUBLIC_SUPABASE_PROJECT_REF ?? '',
      // VAPID application server key (URL-safe base64) for Web Push subscriptions.
      vapidPublicKey: process.env.NUXT_PUBLIC_VAPID_PUBLIC_KEY ?? '',
      // Orbit Depot storage gateway base URL.
      depotUrl: process.env.NUXT_PUBLIC_DEPOT_URL ?? 'https://depot.hivecom.net',
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
    'vite:extendConfig': (config) => {
      // `@/types/*` lives at the repo root, but Nuxt registers `@` -> ./app first
      // and Vite doesn't read tsconfig paths. Prepend a more specific alias.
      const typesReplacement = `${fileURLToPath(new URL('./types', import.meta.url))}/`
      const resolve = config.resolve
      if (!resolve)
        return
      interface AliasEntry { find: string | RegExp, replacement: string }
      const current = resolve.alias
      const entries: AliasEntry[] = Array.isArray(current)
        ? (current as AliasEntry[])
        : Object.entries((current ?? {}) as Record<string, string>).map(([find, replacement]) => ({ find, replacement }))
      resolve.alias = [
        { find: /^@\/types\//, replacement: typesReplacement },
        ...entries,
      ]
    },
    'nitro:build:before': (nitro) => {
      // Force-exit after Nitro closes so CI doesn't hang on open native handles
      nitro.hooks.hook('close', () => {
        if (isBuildCommand) {
          process.exit(0)
        }
      })
    },
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
  fonts: {
    families: [
      // Both are for the OG image templates. Noto Sans SC is the CJK fallback.
      { name: 'Inter', weights: [400, 700], provider: 'google' },
      { name: 'Noto Sans SC', weights: [400, 700], provider: 'google' },
      // No `global: true`: nuxt-og-image resolves these at render time, and global
      // would inject a ~200 kB @font-face stylesheet into every app page.
    ],
    experimental: {
      // Local fallback @font-face rules would override the app's system fonts
      disableLocalFallbacks: true,
    },
  },
  ogImage: {
    // Static site, so every OG image renders at build time
    zeroRuntime: true,
    // node_modules/.cache/nuxt-seo/og-image/, preserved by the CI cache action
    buildCache: true,
  },
  nitro: {
    // nuxt-og-image reads this to pick the nitro-prerender preset
    static: true,
    prerender: {
      failOnError: false,
      crawlLinks: true,
      routes: ['/', '/robots.txt', '/sitemap.xml', '/llms.txt'],
      ignore: ['/auth/callback', '/auth/oauth', '/auth/confirm', '/auth/confirm-password'],
    },
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_PUBLISHABLE_KEY,
    types: '~~/types/database.types.ts',
    redirect: false, // Path-based redirects don't work with SSR
    redirectOptions: {
      login: '/auth/sign-in',
      callback: '/auth/confirm',
    },
    // types: './types/database.types.ts',
    clientOptions: {
      auth: {
        experimental: {
          passkey: true,
          // Without the flow id, each new link overwrites the single PKCE verifier
          // and older links in the inbox stop working. Redirect allow-list
          // entries must be wildcards (/auth/*) so the extra param still matches.
          appendPkceFlowIdToRedirects: true,
        },
      },
    },
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
