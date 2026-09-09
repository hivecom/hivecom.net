import { defineCollection, defineContentConfig, z } from '@nuxt/content'

export default defineContentConfig({
  collections: {
    legal: defineCollection({

      source: 'legal/**/*.md',
      type: 'page',
      schema: z.object({
        // Kept as a string: z.date() coerces to a Date and serializes back
        // using the build machine's timezone, shifting the day off by one.
        date: z.string(),
        revisions: z.array(z.string()).optional(),
        notes: z.array(z.string()).optional(),
      }),
    }),
  },
})
