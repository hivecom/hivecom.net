<script lang="ts" setup>
import LayoutFooter from '@/components/Layout/Footer.vue'
import LayoutNavigation from '@/components/Layout/Navigation.vue'

defineOgImage('Default', {
  title: 'Hivecom',
  description: 'A worldwide community of friends building projects together.',
})
</script>

<template>
  <LayoutNavigation />

  <slot name="hero" />

  <!-- <div class="container container-l"> -->
  <main>
    <slot />
  </main>
  <!-- </div> -->

  <LayoutFooter />
</template>
