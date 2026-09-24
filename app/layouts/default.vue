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
    <!-- Single element root, and it has to stay that way. With a fragment root the
         layout transition silently animates an anchor comment (NUXT_E4002). The dev
         compiler keeps template comments, so this one has to stay inside the div. -->
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
