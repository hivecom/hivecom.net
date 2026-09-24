<script setup lang="ts">
import { inject } from 'vue'
import { glowGroupKey } from '@/components/Shared/glowGroup'

// Tracks the mouse and applies a radial border glow plus a subtle body glow on
// hover. Inside a <GlowGroup> the group does the tracking and pushes card-relative
// coordinates here, so the glow spreads across sibling cards. Standalone, GlowCard
// tracks its own mousemove/mouseleave.

interface Props {
  noGlow?: boolean
  noBorders?: boolean
  halo?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  noGlow: false,
  noBorders: false,
  halo: false,
})

const group = inject(glowGroupKey, null)

const wrapperRef = useTemplateRef<HTMLElement>('wrapperRef')
const isActive = ref(false)

// Called by GlowGroup with coordinates already relative to this card's rect.
function setPosition(x: number, y: number) {
  const el = wrapperRef.value
  if (!el)
    return

  el.style.setProperty('--mouse-x', `${x}px`)
  el.style.setProperty('--mouse-y', `${y}px`)
}

function activate() {
  const el = wrapperRef.value
  if (!el || isActive.value)
    return

  isActive.value = true

  // Defer by one frame so the position is painted before the glow fades in
  requestAnimationFrame(() => el.classList.add('glow-active'))
}

function deactivate() {
  const el = wrapperRef.value
  if (!el)
    return

  isActive.value = false
  el.classList.remove('glow-active')
}

function clearPosition() {
  const el = wrapperRef.value
  if (!el)
    return

  el.style.removeProperty('--mouse-x')
  el.style.removeProperty('--mouse-y')
}

if (group) {
  group.register({ setPosition, clearPosition, activate, deactivate, getEl: () => wrapperRef.value })
  onUnmounted(() => {
    group.unregister({ setPosition, clearPosition, activate, deactivate, getEl: () => wrapperRef.value })
  })
}

// Standalone mode: handle our own tracking when not inside a GlowGroup.
function handleMouseMove(e: MouseEvent) {
  if (group)
    return

  const el = wrapperRef.value
  if (!el)
    return

  const rect = el.getBoundingClientRect()
  setPosition(e.clientX - rect.left, e.clientY - rect.top)
  activate()
}

function handleMouseLeave() {
  if (group)
    return

  deactivate()
}

function handleTouchMove(e: TouchEvent) {
  if (group)
    return

  const touch = e.touches[0]
  if (!touch)
    return

  const el = wrapperRef.value
  if (!el)
    return

  const rect = el.getBoundingClientRect()
  setPosition(touch.clientX - rect.left, touch.clientY - rect.top)
  activate()
}

function handleTouchEnd() {
  if (group)
    return

  deactivate()
}
</script>

<template>
  <div
    ref="wrapperRef"
    class="glow-card"
    :class="{
      'glow-card--no-glow': props.noGlow,
      'glow-card--no-borders': props.noBorders,
      'glow-card--halo': props.halo,
    }"
    @mousemove="handleMouseMove"
    @mouseleave="handleMouseLeave"
    @touchmove.passive="handleTouchMove"
    @touchend="handleTouchEnd"
  >
    <slot />
  </div>
</template>

<style lang="scss" scoped>
.glow-card {
  position: relative;
  border-radius: var(--border-radius-m);
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;

  // Animated border glow that tracks the cursor.
  // Uses the mask trick to paint only the 1px border region.
  // --mouse-x/--mouse-y are registered as typed <length> @property values in
  // index.scss, so the browser interpolates them and the glow glides smoothly.
  &::after {
    content: '';
    position: absolute;
    inset: -1px;
    border-radius: inherit;
    padding: 1px;
    background: radial-gradient(200px circle at var(--mouse-x) var(--mouse-y), var(--color-accent), transparent 70%);
    -webkit-mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    opacity: 0;
    transition: var(--transition-slow);
    pointer-events: none;
    z-index: 1;
  }

  &.glow-active::after {
    opacity: 1;
  }

  & > :deep(*) {
    transition: var(--transition-slow);

    // Body glow injected into whatever card is slotted. It has to live here rather
    // than on .glow-card itself, since the card's background would paint over it.
    &::before {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: radial-gradient(
        350px circle at var(--mouse-x) var(--mouse-y),
        color-mix(in srgb, var(--color-accent) 7%, transparent),
        transparent 70%
      );
      opacity: 0;
      transition: var(--transition-slow);
      pointer-events: none;
      z-index: 0;
    }
  }

  &.glow-active > :deep(*) {
    &::before {
      opacity: 1;
    }
  }

  &--no-borders {
    &::after {
      display: none;
    }
  }

  &--no-glow {
    & > :deep(*::before) {
      display: none;
    }
  }

  &--halo {
    transition: var(--transition-slow);
    border-bottom: 1px solid transparent;

    &:hover {
      box-shadow: 0 8px 16px 0px color-mix(in srgb, var(--color-accent) 10%, transparent);
      border-bottom-color: var(--color-accent);
    }
  }
}
</style>
