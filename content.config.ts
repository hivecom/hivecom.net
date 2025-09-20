import { defineCollection, defineContentConfig, z } from '@nuxt/content'

export default defineContentConfig({
  collections: {
    legal: defineCollection({

      source: 'legal/**/*.md',
      type: 'page',
      schema: z.object({
        date: z.date(),
        revisions: z.array(z.string()).optional(),
      }),
    }),
  },
})
