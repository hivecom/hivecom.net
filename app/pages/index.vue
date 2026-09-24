<script setup lang="ts">
import { Tab, Tabs } from '@dolanske/vui'
import HomeBackdrop from '@/components/Home/HomeBackdrop.vue'
import HomeDashboard from '@/components/Home/HomeDashboard.vue'
import HomeMarketing from '@/components/Home/HomeMarketing.vue'
import '@/assets/pages/home.scss'

// Logged-in users get the dashboard, guests the landing. The choice resolves behind
// the loading splash (which waits on the auth session), so there's no marketing
// flash. Marketing stays the prerendered branch for SEO and the logged-out first paint.
const user = useSupabaseUser()
const nuxtApp = useNuxtApp()

// Lets a logged-in user peek at the landing and come back. Local-only, no route
// or query - everyone lands at / regardless.
// const showLanding = ref(false)
const activeTab = ref<'home' | 'dashboard'>('dashboard')

// The server and the hydrating render always output marketing. A dev request carries
// the auth cookie, and a server-rendered dashboard can't hydrate: cards read their
// localStorage cache in setup, so the client's first render never matches the server's
// skeletons. `isHydrating` is client-only, so the server is named explicitly.
const hydrating = ref(import.meta.server || nuxtApp.isHydrating)

// The post-hydration branch fix lands uncrossfaded before first paint, and the
// transition re-arms a frame later for tab swaps. That pass drops `out-in` too: with
// `:css="false"` and no JS leave hook, out-in's afterLeave re-renders the Transition
// inside the patch that's still unmounting, which crashes on `el.parentNode`.
const animateSwap = ref(!nuxtApp.isHydrating)

const showDashboard = computed(() =>
  !hydrating.value && !!user.value && activeTab.value === 'dashboard')

onMounted(() => {
  hydrating.value = false

  requestAnimationFrame(() => {
    animateSwap.value = true
  })
})

watch(activeTab, () => {
  window.scrollTo({ top: 0, behavior: 'smooth' })
})
</script>

<template>
  <div class="home">
    <!-- Keep this root element the only node in the template, comments included.
         Anything alongside it makes a fragment and Nuxt drops the page transition
         for this route (NUXT_E4004). -->
    <!-- Nebula and stars sit outside the transition so they persist across the swap -->
    <HomeBackdrop :variant="showDashboard ? 'dashboard' : 'landing'" />

    <!-- out-in so the dashboard fades away first, then the landing rises up into
         place. The backdrop stays put underneath, so there's no bare frame. -->
    <Transition name="home-swap" :css="animateSwap" :mode="animateSwap ? 'out-in' : undefined">
      <HomeDashboard v-if="showDashboard" />
      <HomeMarketing v-else />
    </Transition>

    <!-- Held back until after hydration for the same reason the dashboard is:
         prerendered HTML has no session and leaves these out, so rendering them
         on the first client pass hydrates a div onto a comment anchor. -->
    <div v-if="!hydrating && user" class="home-swap-tabs">
      <Tabs v-model="activeTab" variant="filled">
        <Tab value="home">
          Home
        </Tab>
        <Tab value="dashboard">
          Dashboard
        </Tab>
      </Tabs>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// main is a centering column flex container, so the root has to claim the width
.home {
  width: 100%;
}

// The backdrop and the swap tabs are position: fixed children of this root, and
// a transform anywhere above them re-anchors them to that ancestor. The global
// page transition slides on translateY, so drop the movement here and let this
// page cross-fade instead.
.page-enter-from,
.page-enter-to,
.page-leave-from,
.page-leave-to {
  transform: none;
}

// Vue tags the child component's root element with this scope, so these classes
// land on .dashboard / .home-page directly.
.home-swap-enter-active {
  transition:
    opacity 500ms ease,
    transform 600ms cubic-bezier(0.22, 1, 0.36, 1);
}

.home-swap-leave-active {
  transition: opacity 350ms ease;
}

.home-swap-enter-from {
  opacity: 0;
  transform: translateY(48px);
}

.home-swap-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .home-swap-enter-from {
    transform: none;
  }
}
</style>

<style>
.home-swap-tabs {
  position: fixed;
  top: 76px;
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-sticky);
  box-shadow: 0 1px 12px color-mix(in srgb, var(--color-bg) 50%, transparent);
  border-radius: var(--border-radius-pill);
  transition: box-shadow var(--transition);

  &:hover {
    box-shadow: 0 4px 32px color-mix(in srgb, var(--color-accent) 30%, transparent);
  }

  .vui-tabs {
    border: 1px solid var(--color-border-weak);
  }

  --border-radius-m: var(--border-radius-pill);
}

:root.light .home-swap-tabs {
  border: 1px solid var(--color-border-strong);
  box-shadow: 0 1px 12px color-mix(in srgb, var(--dark-color-bg) 15%, transparent);

  &:hover {
    box-shadow: 0 4px 32px color-mix(in srgb, var(--dark-color-bg) 30%, transparent);
  }
}
</style>
