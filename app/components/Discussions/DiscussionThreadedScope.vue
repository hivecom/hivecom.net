<script setup lang="ts">
import { ref } from 'vue'
import { DISCUSSION_KEYS } from './Discussion.keys'

// Forces threaded view for descendants, like the replies sheet inside flat view
provide(DISCUSSION_KEYS.viewMode, ref<'flat' | 'threaded'>('threaded'))
</script>

<template>
  <slot />
</template>
