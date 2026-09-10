<script setup lang="ts">
import type { FocusTargetHandle } from '@/components/Shared/focusFrame'
import { inject, onMounted, onUnmounted, ref } from 'vue'
import { focusFrameKey } from '@/components/Shared/focusFrame'

// FocusTarget marks a block the enclosing FocusFrame can settle on, either by
// scrolling it into view or by hovering it. It only adds a wrapper div so the
// frame has one rect to measure. Without a FocusFrame above it, it's a plain
// wrapper.

const props = defineProps<{
  // Distance the brackets sit outside this box, overriding the frame default.
  // Negative pulls them inside, which a full-viewport target needs.
  padding?: number
  paddingTop?: number
  // Skip hover focus. For targets that fill the screen, hover means nothing.
  noHover?: boolean
}>()

const frame = inject(focusFrameKey, null)

const targetRef = ref<HTMLElement | null>(null)

const handle: FocusTargetHandle = {
  getEl: () => targetRef.value,
  getPadding: () => props.padding,
  getPaddingTop: () => props.paddingTop,
}

if (frame) {
  onMounted(() => frame.register(handle))
  onUnmounted(() => frame.unregister(handle))
}

function onMouseEnter() {
  if (!props.noHover)
    frame?.notifyEnter(handle)
}

function onMouseLeave() {
  if (!props.noHover)
    frame?.notifyLeave(handle)
}
</script>

<template>
  <div ref="targetRef" class="focus-target" @mouseenter="onMouseEnter" @mouseleave="onMouseLeave">
    <slot />
  </div>
</template>
