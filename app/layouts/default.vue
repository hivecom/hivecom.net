<script lang="ts" setup>
defineOgImageComponent('Default', {
  title: 'Hivecom',
  description: 'A worldwide community of friends building projects together.',
})
</script>

<template>
  <LayoutNavigation />

  <div class="container container-l">
    <main>
      <slot />
    </main>
  </div>

  <LayoutFooter />
</template>
