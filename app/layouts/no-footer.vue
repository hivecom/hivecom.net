<script lang="ts" setup>
import LayoutNavigation from '@/components/Layout/Navigation.vue'
</script>

<template>
  <div class="layout-root">
    <!-- Single element root for the layout transition, same as default.vue. -->
    <LayoutNavigation />

    <main>
      <slot />
    </main>
  </div>
</template>
