// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: ["@nuxtjs/supabase"],
  supabase: {},
  // nitro: {
  //   prerender: {
  //     crawlLinks: true,
  //     failOnError: false, 
  //   },
  // }
})
