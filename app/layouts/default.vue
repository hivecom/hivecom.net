<script lang="ts" setup>
import LayoutFooter from '@/components/Layout/Footer.vue'
import LayoutNavigation from '@/components/Layout/Navigation.vue'

defineOgImage('Default', {
  title: 'Hivecom',
  description: 'A worldwide community of friends building projects together.',
})
</script>

<template>
  <div class="layout-root">
    <!-- Single element root, and it has to stay that way. The layout transition
         animates this node, and a fragment root gives it an anchor comment to
         animate instead, which silently does nothing (NUXT_E4002). The comment
         lives inside the root on purpose: the dev compiler keeps template
         comments, so one sitting above the div makes the root a fragment again. -->
    <LayoutNavigation />

    <slot name="hero" />

    <!-- <div class="container-l"> -->
    <main>
      <slot />
    </main>
    <!-- </div> -->

    <LayoutFooter />
  </div>
</template>
