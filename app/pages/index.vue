<script setup lang="ts">
import { Tab, Tabs } from '@dolanske/vui'
import HomeBackdrop from '@/components/Home/HomeBackdrop.vue'
import HomeDashboard from '@/components/Home/HomeDashboard.vue'
import HomeMarketing from '@/components/Home/HomeMarketing.vue'
import '@/assets/pages/home.scss'

// Logged-in users get the dashboard; guests get the marketing landing. The
// decision is reactive and resolves behind the global loading splash (which
// blocks on the auth session), so there's no marketing flash for logged-in
// users. Marketing stays the default/prerendered branch, so SEO and the
// logged-out first paint are unaffected.
const user = useSupabaseUser()
const nuxtApp = useNuxtApp()

// Lets a logged-in user peek at the landing and come back. Local-only, no route
// or query - everyone lands at / regardless.
// const showLanding = ref(false)
const activeTab = ref<'home' | 'dashboard'>('dashboard')

// Marketing is always what goes into the HTML, and the hydrating render has to
// agree with it. Production prerenders `/` with no session and gets there on its
// own, but a dev request carries the auth cookie and would otherwise render the
// dashboard server-side, which it can't survive: every card reads its
// localStorage cache during setup and fetches in onMounted, so the server paints
// skeletons and empty states while the client's very first render already has
// the cached data, and each card hydrates onto markup for a branch it isn't in.
// Pinning the server to marketing makes dev behave like prod - the dashboard
// mounts client-side, once, with its data.
//
// `isHydrating` is a client-only flag, so the server needs saying explicitly.
// A client-side navigation to `/` starts false and lands on the right branch
// immediately.
const hydrating = ref(import.meta.server || nuxtApp.isHydrating)

// Correcting the branch after hydration is a fix-up rather than a view change,
// so it lands uncrossfaded and before the first paint. Re-armed a frame later
// for the tab swaps, which are what the transition is actually for.
//
// This also has to drop `out-in` for that one pass, not just the CSS. With
// `:css="false"` and no JS leave hook, Vue calls the leave `done()` synchronously
// while it's unmounting the outgoing branch, and out-in's `afterLeave` answers
// that by re-running the Transition's own render from inside the patch that's
// still unmounting. The reentrant pass then patches against a placeholder vnode
// whose element hasn't been created yet and blows up on `el.parentNode`. Default
// mode has no `afterLeave`, so the swap finishes in the one patch.
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
    <!-- Keep this root element the only node in the template, comments
         included. Anything alongside it compiles to a fragment, the page vnode
         resolves to the fragment anchor instead of an element, and Nuxt drops
         the page transition for this route (NUXT_E4004). -->
    <!-- Nebula + stars live here, outside the transition, so they persist across
         the swap instead of tearing down with whichever view is leaving. The
         variant just crossfades the overlay treatment. -->
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
// its children used to claim themselves.
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
