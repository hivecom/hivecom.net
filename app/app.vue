<script setup lang="ts">
import { Toasts } from '@dolanske/vui'
import { computed } from 'vue'
import Command from '@/components/Command.vue'
import LayoutLoading from '@/components/Layout/Loading.vue'
import ThemeEditorControls from '@/components/Themes/ThemeEditorControls.vue'
import { useUserTheme } from '@/composables/useUserTheme'
import { useLastSeenTracking } from '@/lib/lastSeen'
import ConfirmModal from './components/Shared/ConfirmModal.vue'

const route = useRoute()
const site = useSiteConfig()
const runtimeConfig = useRuntimeConfig()

const canonicalUrl = computed(() => {
  const baseUrl = runtimeConfig.public.baseUrl || 'https://hivecom.net'
  return new URL(route.path, baseUrl).toString()
})

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

// Load and apply the user's custom theme (if any) from their profile
const { pendingTheme, confirmPendingTheme } = useUserTheme()
const { editorActive } = useThemeEditorState()
</script>

<template>
  <NuxtLoadingIndicator color="var(--color-accent)" />

  <div class="app-shell" :class="{ 'theme-editing': editorActive }">
    <div vaul-drawer-wrapper>
      <NuxtLayout :name="layoutName">
        <NuxtPage />
      </NuxtLayout>
    </div>

    <ThemeEditorControls v-if="editorActive" />
  </div>

  <ClientOnly>
    <Toasts />
  </ClientOnly>

  <!-- Global always present components -->
  <LayoutLoading />
  <Command />
  <ConfirmModal
    :open="!!pendingTheme"
    title="Apply theme with custom CSS?"
    :description="pendingTheme?.hasUrl
      ? 'This theme contains custom CSS with external URL references, which may load remote resources or track your activity. Apply anyway?'
      : 'This theme contains custom CSS that can alter the appearance of the site in unexpected ways. Apply anyway?'"
    confirm-text="Apply theme"
    @confirm="confirmPendingTheme"
    @cancel="pendingTheme = null"
  >
    <pre class="theme-custom-css-viewer">{{ pendingTheme?.theme.custom_css }}</pre>
  </ConfirmModal>
</template>

<style lang="scss">
@use '@/assets/breakpoints.scss' as *;

/* Custom page transitions that work better with data fetching */
.page-enter-active {
  transition: var(--transition);
  transition-delay: var(--transition-slow-duration); /* Delay entry to ensure old page has unmounted */
}

.page-leave-active {
  transition: var(--transition);
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

.theme-custom-css-viewer {
  max-height: 328px;
  overflow-y: auto;
}

// Two column layout unless on mobile
@media screen and (min-width: $breakpoint-s) {
  .app-shell {
    &.theme-editing {
      position: relative;
      // The actual vaul drawer houses the application. While editing, we force it
      // to the screen and make it scrollable. This _could_ break some things, but
      // it's only during theming so we can let that be
      [vaul-drawer-wrapper] {
        position: relative;
        overflow: hidden;
        overflow-y: auto;
        height: 100vh;
      }

      display: grid;
      grid-template-columns: 1fr var(--editor-width);
    }
  }
}
</style>
