<script setup lang="ts">
import { ref } from 'vue'
import { DISCUSSION_KEYS } from './Discussion.keys'

// Override viewMode to 'threaded' for all descendants, regardless of
// the outer discussion context. Used by the sheet in flat/chronological view.
provide(DISCUSSION_KEYS.viewMode, ref<'flat' | 'threaded'>('threaded'))
</script>

<template>
  <slot />
</template>
