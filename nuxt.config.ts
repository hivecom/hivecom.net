// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: [
    "@nuxtjs/supabase",
    "@nuxt/image",
    "@pinia/nuxt",
    "@vueuse/nuxt",
    "nuxt-icon"
  ],
  css: [
    '~/assets/index.scss'
  ],
  supabase: {},
  // nitro: {
  //   prerender: {
  //     crawlLinks: true,
  //     failOnError: false, 
  //   },
  // }
})