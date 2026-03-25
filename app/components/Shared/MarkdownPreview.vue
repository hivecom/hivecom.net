<script setup lang="ts">
import { computed } from 'vue'
import { formatMarkdownPreview } from '@/lib/markdownProcessors'

interface Props {
  markdown?: string | null
  mentionLookup?: Record<string, string>
  maxLength?: number
}

const props = withDefaults(defineProps<Props>(), {
  mentionLookup: () => ({}),
  maxLength: 0,
})

const preview = computed(() =>
  formatMarkdownPreview(props.markdown ?? '', props.mentionLookup ?? {}, props.maxLength ?? 0),
)
</script>

<template>
  <p v-if="preview !== '#empty'" class="markdown-preview">
    <i v-if="preview === '#link'">
      <Icon name="ph:link" :size="18" />
      Posted a link
    </i>
    <i v-else-if="preview === '#image'">
      <Icon name="ph:image" :size="18" />
      Posted an image
    </i>
    <i v-else-if="preview === '#youtube'">
      <Icon name="ph:youtube-logo" :size="18" />
      Posted a video
    </i>
    <i v-else-if="preview === '#video'">
      <Icon name="ph:video" :size="18" />
      Posted a video
    </i>
    <i v-else-if="preview === '#math'">
      <Icon name="ph:math-operations" :size="18" />
      Posted math
    </i>
    <i v-else-if="preview === '#spoiler'">
      <Icon name="ph:eye-slash" :size="18" />
      Posted a spoiler
    </i>
    <i v-else-if="preview === '#table'">
      <Icon name="ph:table" :size="18" />
      Posted a table
    </i>
    <template v-else>
      {{ preview }}
    </template>
  </p>
</template>

<style scoped lang="scss">
.markdown-preview {
  i {
    display: inline-flex;
    gap: var(--space-xxs);
    align-items: center;
    font-size: inherit;
  }
}
</style>
