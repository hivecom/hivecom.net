<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { wrapCode } from '@/lib/utils/formatting'
import MarkdownRenderer from '../Shared/MarkdownRenderer.vue'

defineProps<{
  data: Tables<'themes'>
}>()
</script>

<template>
  <MarkdownRenderer :md="data.custom_css.length > 0 ? wrapCode(data.custom_css, 'css') : 'No custom CSS implemented.'" />
</template>
