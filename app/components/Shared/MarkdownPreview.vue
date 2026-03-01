<script setup lang="ts">
import { computed } from 'vue'
import { formatMarkdownPreview } from '@/lib/markdown-processors'

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
