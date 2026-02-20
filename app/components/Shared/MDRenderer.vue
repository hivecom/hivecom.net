<script setup>
import { Skeleton } from '@dolanske/vui'
import { computed, ref, watchEffect } from 'vue'
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

const supabase = useSupabaseClient()
const mentionLookup = ref({})
let mentionRequestId = 0

watchEffect(async () => {
  const ids = extractMentionIds(props.md)
  const requestId = ++mentionRequestId

  if (ids.length === 0) {
    mentionLookup.value = {}
    return
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', ids)

  if (requestId !== mentionRequestId) {
    return
  }

  if (error || !data) {
    mentionLookup.value = {}
    return
  }

  mentionLookup.value = Object.fromEntries(
    data
      .filter(profile => profile.username)
      .map(profile => [profile.id, profile.username]),
  )
})

// Process the markdown to convert @mentions to links
const processedMarkdown = computed(() => {
  return processMentions(props.md, mentionLookup.value)
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
