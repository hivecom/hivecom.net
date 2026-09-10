<script setup lang="ts">
import type { AtypeName } from '@/lib/atype.generated'
import { computed } from 'vue'
import { ATYPE } from '@/lib/atype.generated'

// AtypeText draws one of the pre-rendered hidden messages as an inline SVG so
// it picks up currentColor from wherever it sits. The outlines live in
// app/lib/atype.generated.ts.
//
// The messages are decoration for people who know the fonts, so the SVG is
// hidden from assistive tech rather than read out letter by letter.

const props = withDefaults(defineProps<{
  name: AtypeName
  // Rendered height in px. Width follows from the outline's aspect ratio.
  height?: number
}>(), {
  height: 10,
})

const render = computed(() => ATYPE[props.name])
const width = computed(() => Math.round(props.height * render.value.width / render.value.height * 100) / 100)
</script>

<template>
  <svg
    class="atype-text"
    :viewBox="`0 0 ${render.width} ${render.height}`"
    :width="width"
    :height="height"
    aria-hidden="true"
  >
    <path :d="render.d" fill="currentColor" />
  </svg>
</template>

<style lang="scss" scoped>
.atype-text {
  display: block;
  overflow: visible;
}
</style>
