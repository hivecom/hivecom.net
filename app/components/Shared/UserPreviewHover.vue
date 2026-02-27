<script setup lang="ts">
import { Popout } from '@dolanske/vui'
import { onBeforeUnmount, ref, watch } from 'vue'
import UserPreviewCard from '@/components/Shared/UserPreviewCard.vue'

const props = withDefaults(defineProps<{
  userId?: string | null
  maxBadges?: number
  enterDelay?: number
  leaveDelay?: number
}>(), {
  userId: null,
  maxBadges: 3,
  enterDelay: 120,
  leaveDelay: 150,
})

const anchorRef = ref<HTMLElement | null>(null)
const previewVisible = ref(false)
let showTimeout: ReturnType<typeof setTimeout> | null = null
let hideTimeout: ReturnType<typeof setTimeout> | null = null

function clearTimeouts() {
  if (showTimeout) {
    clearTimeout(showTimeout)
    showTimeout = null
  }
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }
}

function handleEnter() {
  if (!props.userId)
    return

  if (showTimeout) {
    clearTimeout(showTimeout)
    showTimeout = null
  }
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }

  if (previewVisible.value)
    return

  showTimeout = setTimeout(() => {
    previewVisible.value = true
  }, props.enterDelay)
}

function handleLeave() {
  if (showTimeout) {
    clearTimeout(showTimeout)
    showTimeout = null
  }

  hideTimeout = setTimeout(() => {
    previewVisible.value = false
  }, props.leaveDelay)
}

onBeforeUnmount(() => {
  clearTimeouts()
})

watch(() => props.userId, (newId) => {
  if (!newId) {
    clearTimeouts()
    previewVisible.value = false
  }
})
</script>

<template>
  <div
    ref="anchorRef"
    class="user-preview-hover"
    @mouseenter="handleEnter"
    @mouseleave="handleLeave"
    @focusin="handleEnter"
    @focusout="handleLeave"
  >
    <slot />

    <Popout
      :anchor="anchorRef" :visible="!!(previewVisible && props.userId)" placement="bottom" :offset="16" @mouseenter="handleEnter"
      @mouseleave="handleLeave"
    >
      <UserPreviewCard
        :user-id="props.userId"
        :max-badges="props.maxBadges"
      />
    </Popout>
  </div>
</template>

<style lang="scss">
.user-preview-hover {
  display: inline-block;
}
</style>
