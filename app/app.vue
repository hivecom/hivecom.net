<script setup lang="ts">
import { Button, Flex, Modal, Toasts } from '@dolanske/vui'
import { computed, ref } from 'vue'
import Command from '@/components/Command.vue'
import LayoutLoading from '@/components/Layout/Loading.vue'
import ThemeEditorControls from '@/components/Themes/ThemeEditorControls.vue'
import { useDataNotifications } from '@/composables/useDataNotifications'
import { useFaviconBadge } from '@/composables/useFaviconBadge'
import { useUserTheme } from '@/composables/useUserTheme'
import { useLastSeenTracking } from '@/lib/lastSeen'
import MarkdownRenderer from './components/Shared/MarkdownRenderer.vue'
import { wrapCode } from './lib/utils/formatting'

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

// Favicon badge - lights up when there are unread notifications or new realtime activity while tab is hidden
const { unreadCount } = useDataNotifications()
const realtimeActivityWhileHidden = ref(false)

// Track new realtime activity that arrives while the tab is not focused
if (import.meta.client) {
  // Expose a global bus for realtime composables to ping
  window.__hivecomActivitySignal = () => {
    if (document.hidden)
      realtimeActivityWhileHidden.value = true
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden)
      realtimeActivityWhileHidden.value = false
  })
}

const faviconActive = computed(() => unreadCount.value > 0 || realtimeActivityWhileHidden.value)
useFaviconBadge(faviconActive)

// Load and apply the user's custom theme (if any) from their profile
const { pendingTheme, confirmPendingTheme, confirmPendingThemeWithoutCss, pendingCssChange, confirmCssChange, dismissCssChange } = useUserTheme()
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

    <div class="app-editor-container">
      <ThemeEditorControls v-if="editorActive" />
    </div>
  </div>

  <ClientOnly>
    <Toasts />
  </ClientOnly>

  <!-- Global always present components -->
  <LayoutLoading />
  <Command />
  <Modal
    :open="!!pendingTheme"
    centered
    scrollable
    :card="{ footerSeparator: true }"
    :can-dismiss="false"
    size="m"
    @close="pendingTheme = null"
  >
    <template #header>
      <Flex column gap="s">
        <h4>Apply theme with custom CSS?</h4>
        <p v-if="pendingTheme?.hasUrl">
          This theme contains custom CSS with external URL references, which may load remote resources or track your activity.
        </p>
        <p v-else>
          This theme contains custom CSS that can alter the appearance of the site in unexpected ways.
        </p>
      </Flex>
    </template>

    <MarkdownRenderer v-if="pendingTheme" :skeleton-height="128" class="theme-custom-css-viewer" :md="wrapCode(pendingTheme.theme.custom_css, 'css')" />

    <template #footer="{ close }">
      <Flex gap="xs" expand x-end>
        <Button plain @click="pendingTheme = null; close()">
          Cancel
        </Button>
        <Button @click="confirmPendingThemeWithoutCss(); close()">
          Apply without CSS
        </Button>
        <Button variant="fill" @click="confirmPendingTheme(); close()">
          Apply theme
        </Button>
      </Flex>
    </template>
  </Modal>

  <Modal
    :open="!!pendingCssChange"
    centered
    scrollable
    :card="{ footerSeparator: true }"
    :can-dismiss="false"
    size="m"
    @close="dismissCssChange()"
  >
    <template #header>
      <Flex column gap="s">
        <h4>This theme's CSS has changed</h4>
        <p v-if="pendingCssChange?.hasUrl">
          The custom CSS for this theme has been updated since you last applied it. It contains external URL references, which may load remote resources or track your activity. Review the CSS below before reapplying.
        </p>
        <p v-else>
          The custom CSS for this theme has been updated since you last applied it. Review the changes below before reapplying.
        </p>
      </Flex>
    </template>

    <MarkdownRenderer v-if="pendingTheme" :skeleton-height="128" class="theme-custom-css-viewer" :md="wrapCode(pendingTheme.theme.custom_css, 'css')" />

    <template #footer="{ close }">
      <Flex gap="xs" expand x-end>
        <Button @click="dismissCssChange(); close()">
          Keep old CSS
        </Button>
        <Button variant="fill" @click="confirmCssChange(); close()">
          Apply updated CSS
        </Button>
      </Flex>
    </template>
  </Modal>
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
  // max-height: 328px;
  overflow-y: auto;
}

// Two column layout unless on mobile
@media screen and (min-width: $breakpoint-s) {
  .app-shell {
    &.theme-editing {
      display: grid;
      grid-template-columns: 1fr var(--editor-width);

      [vaul-drawer-wrapper] {
        overflow-x: hidden;
      }

      .theme-editor__controls {
        position: sticky;
        z-index: 500;
        top: 0;
      }
    }
  }
}
</style>
