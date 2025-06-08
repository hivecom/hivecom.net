<script setup>
import { Skeleton } from '@dolanske/vui'
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
</script>

<template>
  <Suspense suspensible>
    <template #fallback>
      <Skeleton :style="{ height: props.skeletonHeight }" />
    </template>
    <MDRendererSlot>
      <MDC
        :partial="true"
        :value="props.md"
        :tag="props.tag"
        :class="`typeset ${props.class}`"
      />
    </MDRendererSlot>
  </Suspense>
</template>
