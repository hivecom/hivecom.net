<script setup lang="ts">
import { Skeleton } from '@dolanske/vui'
import { computed, nextTick, ref } from 'vue'
import MarkdownRendererInner from './MarkdownRendererInner.vue'

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

const showSkeleton = computed(() => props.skeletonHeight !== '0px' && props.skeletonHeight !== 0)

const skeletonStyle = computed(() => ({
  height: typeof props.skeletonHeight === 'number'
    ? `${props.skeletonHeight}px`
    : props.skeletonHeight,
}))

// nextTick defers the flip so skeleton has been painted before its leave transition runs
const resolved = ref(false)

function onSuspenseResolve() {
  nextTick(() => {
    resolved.value = true
  })
}
</script>

<template>
  <div class="md-renderer" :style="!resolved ? skeletonStyle : undefined">
    <Transition name="md-skeleton">
      <Skeleton
        v-if="showSkeleton && !resolved"
        class="md-renderer__skeleton"
        :style="skeletonStyle"
      />
    </Transition>
    <Suspense @resolve="onSuspenseResolve">
      <template #fallback>
        <span />
      </template>
      <Transition name="md-content">
        <MarkdownRendererInner
          v-if="resolved || !showSkeleton"
          :extra-class="props.class"
          :md="props.md"
          :tag="props.tag"
        />
      </Transition>
    </Suspense>
  </div>
</template>

<style scoped lang="scss">
.md-renderer {
  position: relative;
}

.md-renderer__skeleton {
  position: absolute;
  inset: 0;
}

// Skeleton fades out while sitting absolutely on top of the incoming content
.md-skeleton-leave-active {
  transition: opacity 0.2s ease;
  animation: none !important;
  position: absolute;
  inset: 0;
  z-index: 1;
}

.md-skeleton-leave-to {
  opacity: 0;
}

// Content fades in underneath the leaving skeleton, staggered by index if provided
.md-content-enter-active {
  transition: opacity 0.2s ease calc(var(--stagger-index, 0) * 0.05s);
}

.md-content-enter-from {
  opacity: 0;
}
</style>
