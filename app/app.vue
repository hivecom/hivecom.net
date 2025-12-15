<script setup lang="ts">
import { computed } from 'vue'
import { useLastSeenTracking } from '@/lib/lastSeen'

const route = useRoute()

const site = useSiteConfig()
const canonicalUrl = useCanonicalUrl()

useHead(() => ({
  title: site.name,
  titleTemplate: (titleChunk?: string) => {
    if (titleChunk)
      return titleChunk === site.name || titleChunk.includes(`| ${site.name}`) ? titleChunk : `${titleChunk} | ${site.name}`
    return site.name
  },
  htmlAttrs: {
    lang: 'en',
  },
  link: [
    { rel: 'canonical', href: canonicalUrl.value },
  ],
  script: [
    {
      type: 'application/ld+json',
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        'name': site.name,
        'url': site.url,
      }),
    },
    {
      type: 'application/ld+json',
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Organization',
        'name': site.name,
        'url': site.url,
        'logo': new URL('/logo.svg', site.url).toString(),
      }),
    },
  ],
}))

useSeoMeta({
  description: site.description,
  ogSiteName: site.name,
  ogUrl: canonicalUrl,
  ogType: 'website',
  twitterCard: 'summary_large_image',
})
const layoutName = computed(() => {
  if (route.path.startsWith('/admin'))
    return 'admin'

  if (route.path === '/')
    return 'landing'

  return 'default'
})

// Initialize last seen tracking for authenticated users
useLastSeenTracking()
</script>

<template>
  <NuxtLoadingIndicator color="#88ff22" />

  <NuxtLayout :name="layoutName">
    <NuxtPage />
  </NuxtLayout>

  <LayoutLoading />
</template>

<style>
/* Custom page transitions that work better with data fetching */
.page-enter-active {
  transition: all 0.1s linear;
  transition-delay: 0.1s; /* Delay entry to ensure old page has unmounted */
}

.page-leave-active {
  transition: all 0.1s linear;
}

.page-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}

.page-enter-to,
.page-leave-from {
  opacity: 1;
  transform: translateY(0);
}
</style>
