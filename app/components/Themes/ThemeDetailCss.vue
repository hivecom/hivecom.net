<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'

defineProps<{
  data: Tables<'themes'>
}>()
</script>

<template>
  <pre>{{ data.custom_css.length > 0 ? data.custom_css : 'No custom CSS implemented.' }}</pre>
</template>
