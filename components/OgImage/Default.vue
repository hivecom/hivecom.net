<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
  description?: string
}>(), {
  title: 'title',
  description: 'description',
})
// NOTE(jan): Where can I see how this lookst/test it? This looks copied over
// from somewhere and contains tailwind classes
</script>

<template>
  <div class="relative flex h-full w-full bg-[#111] text-white items-center justify-center overflow-hidden">
    <!-- Background light leak effect -->
    <img
      src="/leak.png"
      alt=""
      class="absolute top-0 left-0 h-full w-full object-cover opacity-30 mix-blend-screen"
    >

    <!-- Content container -->
    <div class="z-10 flex flex-col max-w-[1000px]">
      <!-- Logo -->
      <img
        src="/logo.svg"
        alt="Hivecom"
        class="w-256 h-64"
      >
    </div>
  </div>
</template>
