<script setup lang="ts">
import HomeDashboard from '@/components/Home/HomeDashboard.vue'
import HomeMarketing from '@/components/Home/HomeMarketing.vue'

// Logged-in users get the dashboard; guests get the marketing landing. The
// decision is reactive and resolves behind the global loading splash (which
// blocks on the auth session), so there's no marketing flash for logged-in
// users. Marketing stays the default/prerendered branch, so SEO and the
// logged-out first paint are unaffected.
const user = useSupabaseUser()

// Lets a logged-in user peek at the landing and come back. Local-only, no route
// or query - everyone lands at /home regardless.
const showLanding = ref(false)
const showDashboard = computed(() => !!user.value && !showLanding.value)
</script>

<template>
  <HomeDashboard v-if="showDashboard" @view-landing="showLanding = true" />
  <HomeMarketing
    v-else
    :show-back-to-dashboard="!!user && showLanding"
    @back-to-dashboard="showLanding = false"
  />
</template>
