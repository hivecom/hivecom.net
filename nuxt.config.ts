import process from 'node:process'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  // app: {
  //   pageTransition: {
  //     name: 'page',
  //     mode: 'out-in',
  //   },
  //   layoutTransition: {
  //     name: 'layout',
  //     mode: 'out-in',
  //   },
  // },
  devtools: { enabled: true },
  compatibilityDate: '2024-09-25',
  modules: [
    '@nuxtjs/supabase',
    '@nuxtjs/sitemap',
    '@nuxtjs/robots',
    '@nuxtjs/seo',
    '@nuxt/content',
    '@nuxt/image',
    // 'nuxt-toc',
    'nuxt-icon',
    'nuxt-og-image',
    '@pinia/nuxt',
    '@vueuse/nuxt',
  ],
  css: [
    '~/assets/index.scss',
  ],
  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler', // or "modern"
        },
      },
    },
  },
  runtimeConfig: {
    public: {
      patreonClientId: process.env.NUXT_PUBLIC_PATREON_CLIENT_ID ?? '',
    },
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
    redirect: false, // It would make sense to have redirects based on the path, however due to SSR, this is not possible.
    redirectOptions: {
      login: '/auth/sign-in',
      callback: '/auth/confirm',
    },
  },
  site: {
    url: 'https://hivecom.net',
    name: 'Hivecom',
    title: 'Hivecom',
    description: 'A community of friends from all around the world. Creating a space for everyone and projects to thrive.',
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
