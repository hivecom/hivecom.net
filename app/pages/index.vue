<script setup lang="ts">
import { Tab, Tabs } from '@dolanske/vui'
import HomeBackdrop from '@/components/Home/HomeBackdrop.vue'
import HomeDashboard from '@/components/Home/HomeDashboard.vue'
import HomeMarketing from '@/components/Home/HomeMarketing.vue'

// Logged-in users get the dashboard; guests get the marketing landing. The
// decision is reactive and resolves behind the global loading splash (which
// blocks on the auth session), so there's no marketing flash for logged-in
// users. Marketing stays the default/prerendered branch, so SEO and the
// logged-out first paint are unaffected.
const user = useSupabaseUser()

// Lets a logged-in user peek at the landing and come back. Local-only, no route
// or query - everyone lands at / regardless.
// const showLanding = ref(false)
const activeTab = ref<'home' | 'dashboard'>('dashboard')
const showDashboard = computed(() => !!user.value && activeTab.value === 'dashboard')

watch(activeTab, () => {
  window.scrollTo({ top: 0, behavior: 'smooth' })
})
</script>

<template>
  <!-- Nebula + stars live here, outside the transition, so they persist across
       the swap instead of tearing down with whichever view is leaving. The
       variant just crossfades the overlay treatment. -->
  <HomeBackdrop :variant="showDashboard ? 'dashboard' : 'landing'" />

  <!-- out-in so the dashboard fades away first, then the landing rises up into
       place. The backdrop stays put underneath, so there's no bare frame. -->
  <Transition name="home-swap" mode="out-in">
    <HomeDashboard v-if="showDashboard" />
    <HomeMarketing v-else :skip-splash="showDashboard" />
  </Transition>

  <div v-if="user" class="home-swap-tabs">
    <Tabs v-model="activeTab" variant="filled">
      <Tab value="home">
        Home
      </Tab>
      <Tab value="dashboard">
        Dashboard
      </Tab>
    </Tabs>
  </div>
</template>

<style lang="scss" scoped>
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
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-sticky);

  .vui-tabs {
    border: 1px solid var(--color-border-weak);
  }

  --border-radius-m: var(--border-radius-pill);
}
</style>
