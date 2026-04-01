<script lang="ts" setup>
// Use the shared default OG image component; the dedicated Landing component does not exist yet
defineOgImage('Default', {
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
