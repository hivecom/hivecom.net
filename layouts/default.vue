<script lang="ts" setup>
defineOgImageComponent('Default', {
  title: 'Hivecom',
  description: 'A worldwide community of friends building projects together.',
})
</script>

<template>
  <LayoutNavigation />

  <main>
    <slot />
  </main>

  <LayoutFooter />
</template>
