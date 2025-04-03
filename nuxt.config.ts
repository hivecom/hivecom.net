import process from 'node:process'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  compatibilityDate: '2024-09-25',

  modules: [
    '@nuxtjs/supabase',
    '@nuxt/image',
    '@pinia/nuxt',
    '@vueuse/nuxt',
    'nuxt-icon',
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
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      include: undefined,
      // TODO: remove
      exclude: ['/', '/votes', '/votes/create', '/votes/1'],
      cookieRedirect: false,
    },
  },
  // nitro: {
  //   prerender: {
  //     crawlLinks: true,
  //     failOnError: false,
  //   },
  // }
})
