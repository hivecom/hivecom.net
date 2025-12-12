<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import UserPreviewCard from '@/components/Shared/UserPreviewCard.vue'

// TODO: Could Popout.vue be used instead of the custom popover logic here?

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
const popoverRef = ref<HTMLElement | null>(null)
const previewVisible = ref(false)
const popoverPosition = ref<{ top: number, left: number } | null>(null)
const popoverPlacement = ref<'bottom' | 'top'>('bottom')
const lastPopoverHeight = ref(0)
let showTimeout: ReturnType<typeof setTimeout> | null = null
let hideTimeout: ReturnType<typeof setTimeout> | null = null
let listenersAttached = false

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

function updatePopoverPosition() {
  const target = anchorRef.value
  if (!target)
    return

  const rect = target.getBoundingClientRect()
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight
  const offset = 8

  const popoverEl = popoverRef.value
  const popoverHeight = popoverEl?.offsetHeight ?? lastPopoverHeight.value
  if (popoverEl)
    lastPopoverHeight.value = popoverEl.offsetHeight

  let placement: 'bottom' | 'top' = 'bottom'
  let top = rect.bottom + offset
  const projectedBottom = top + (popoverHeight || 0)
  if (popoverHeight && projectedBottom > viewportHeight - offset) {
    placement = 'top'
    top = rect.top - offset
  }

  popoverPlacement.value = placement
  popoverPosition.value = {
    top,
    left: rect.left + rect.width / 2,
  }
}

function handleGlobalReposition() {
  if (previewVisible.value)
    updatePopoverPosition()
}

function attachGlobalListeners() {
  if (listenersAttached)
    return

  window.addEventListener('scroll', handleGlobalReposition, true)
  window.addEventListener('resize', handleGlobalReposition)
  listenersAttached = true
}

function detachGlobalListeners() {
  if (!listenersAttached)
    return

  window.removeEventListener('scroll', handleGlobalReposition, true)
  window.removeEventListener('resize', handleGlobalReposition)
  listenersAttached = false
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
    nextTick(() => {
      updatePopoverPosition()
    }).catch(() => {})
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
  detachGlobalListeners()
})

watch(() => props.userId, (newId) => {
  if (!newId) {
    clearTimeouts()
    previewVisible.value = false
  }
})

watch(previewVisible, (visible) => {
  if (visible) {
    updatePopoverPosition()
    attachGlobalListeners()
  }
  else {
    detachGlobalListeners()
  }
})

const popoverStyle = computed(() => {
  if (!popoverPosition.value)
    return undefined

  return {
    top: `${popoverPosition.value.top}px`,
    left: `${popoverPosition.value.left}px`,
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

    <Teleport to="body">
      <Transition name="user-preview-fade">
        <div
          v-if="previewVisible && props.userId && popoverStyle"
          ref="popoverRef"
          class="user-preview-hover__popover"
          :class="`user-preview-hover__popover--${popoverPlacement}`"
          :style="popoverStyle"
          @mouseenter="handleEnter"
          @mouseleave="handleLeave"
          @focusin="handleEnter"
          @focusout="handleLeave"
        >
          <UserPreviewCard
            :user-id="props.userId"
            :max-badges="props.maxBadges"
          />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.user-preview-hover {
  display: inline-flex;
}

.user-preview-hover__popover {
  position: fixed;
  z-index: 9999;
  min-width: 260px;
  max-width: 320px;
  pointer-events: auto;

  &--bottom {
    transform: translate(-50%, 0);
  }

  &--top {
    transform: translate(-50%, -100%);
  }
}

.user-preview-fade-enter-active,
.user-preview-fade-leave-active {
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
}

.user-preview-fade-enter-from,
.user-preview-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -6px);
}

.user-preview-fade-enter-to,
.user-preview-fade-leave-from {
  opacity: 1;
  transform: translate(-50%, 0);
}

.user-preview-hover__popover--top.user-preview-fade-enter-from,
.user-preview-hover__popover--top.user-preview-fade-leave-to {
  transform: translate(-50%, calc(-100% - 6px));
}

.user-preview-hover__popover--top.user-preview-fade-enter-to,
.user-preview-hover__popover--top.user-preview-fade-leave-from {
  transform: translate(-50%, -100%);
}
</style>
