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
  // css: [
  //   '@dolanske/vui/dist/style.css',
  //   '~/assets/index.scss',
  // ],
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
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      include: undefined,
      exclude: ['/', '/votes'],
      cookieRedirect: false,
    },
  },
  imports: {
    presets: [
      {
        from: '@dolanske/vui',
        imports: [],
      },
    ],
  },
  // nitro: {
  //   prerender: {
  //     crawlLinks: true,
  //     failOnError: false,
  //   },
  // }
})
