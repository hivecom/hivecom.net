<script setup>
import { Skeleton } from '@dolanske/vui'
import { computed, nextTick } from 'vue'
import { useBulkUserData } from '@/composables/useCacheUserData'
import { extractMentionIds, processMentions } from '@/lib/markdown-processors'
import MDLightbox from './MDLightbox.vue'

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

// Called when markdown is fully rendered
const lightbox = useTemplateRef('lightbox')

function onSuspenseResolve() {
  nextTick(() => {
    if (lightbox.value) {
      lightbox.value.register()
    }
  })
}
</script>

<template>
  <Suspense suspensible @resolve="onSuspenseResolve">
    <template #fallback>
      <Skeleton :style="{ height: props.skeletonHeight }" />
    </template>
    <div style="display: contents;">
      <MDC
        :partial="true"
        :value="processedMarkdown"
        :tag="props.tag"
        :class="`typeset ${props.class}`"
      />

      <MDLightbox v-if="props.md" ref="lightbox" :markdown="props.md" />
    </div>
  </Suspense>
</template>

<style lang="scss">
/* YouTube embed produced by processYoutubeDirectives */
.md-youtube-embed {
  display: flex;
  justify-content: center;
  margin: var(--space-s) 0;

  iframe {
    max-width: 100%;
    border-radius: var(--border-radius-s);
    aspect-ratio: 16 / 9;
    height: auto;
  }
}

/* KaTeX math produced by rehype-katex */
.katex-display {
  overflow-x: auto;
  overflow-y: hidden;
  padding: var(--space-xs) 0;
}
</style>
