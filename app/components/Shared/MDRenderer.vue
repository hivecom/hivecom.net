<script setup>
import { Skeleton } from '@dolanske/vui'
import { computed } from 'vue'
import { useBulkUserData } from '@/composables/useCacheUserData'
import { extractMentionIds, processMentions } from '@/lib/markdown-processors'
import MDRendererSlot from './MDRendererSlot.vue'

const props = defineProps({
  tag: {
    type: String,
  },
  class: {
    type: String,
    default: '',
  },
  md: {
    type: String,
    required: true,
  },
  skeletonHeight: {
    type: [String, Number],
    default: '320px',
  },
})

// Extract mention IDs and pre-fetch user data efficiently
const mentionIds = computed(() => extractMentionIds(props.md))

// We pre-fetch basic profile data so UserMention components
// can render synchronously (or near-synchronously) without individual fetches.
useBulkUserData(mentionIds)

// Process the markdown to convert @mentions to <UserMention> components
const processedMarkdown = computed(() => {
  return processMentions(props.md)
})
</script>

<template>
  <Suspense suspensible>
    <template #fallback>
      <Skeleton :style="{ height: props.skeletonHeight }" />
    </template>
    <MDRendererSlot>
      <MDC
        :partial="true"
        :value="processedMarkdown"
        :tag="props.tag"
        :class="`typeset ${props.class}`"
      />
    </MDRendererSlot>
  </Suspense>
</template>

<style lang="scss">
/* Style all links in markdown content */
p a {
  color: var(--color-accent);
  text-decoration: none;
  transition: all 0.2s ease;
}

p a:hover {
  opacity: 0.8;
}
</style>
