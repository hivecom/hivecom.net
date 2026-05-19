<script setup lang="ts">
import { inject } from 'vue'
import { glowGroupKey } from '@/components/Shared/glowGroup'

// GlowCard wraps any content in a div that tracks mouse position and applies
// a Vercel-style radial border glow + subtle body glow on hover.
//
// When placed inside a <GlowGroup>, the group handles mouse tracking on the
// shared container and pushes per-card-relative coordinates here via inject,
// so the glow spreads across all sibling cards simultaneously.
// When used standalone, GlowCard handles its own mousemove/mouseleave.

interface Props {
  noGlow?: boolean
  halo?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  noGlow: false,
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

// Register with the group so it can drive our position.
if (group) {
  group.register({ setPosition, clearPosition, activate, deactivate, getEl: () => wrapperRef.value })
  onUnmounted(() => {
    group.unregister({ setPosition, clearPosition, activate, deactivate, getEl: () => wrapperRef.value })
  })
}

// Standalone mode - handle our own tracking when not inside a GlowGroup.
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
</script>

<template>
  <div
    ref="wrapperRef"
    class="glow-card"
    :class="{
      'glow-card--no-glow': props.noGlow,
      'glow-card--halo': props.halo,
    }"
    @mousemove="handleMouseMove"
    @mouseleave="handleMouseLeave"
  >
    <slot />
  </div>
</template>

<style lang="scss" scoped>
.glow-card {
  position: relative;
  border-radius: var(--border-radius-m);
  height: 100%;
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

  // Transition background-color on the slotted card on hover
  & > :deep(*) {
    transition: var(--transition-slow);

    // Body glow injected into whatever card is slotted - must live here
    // rather than on .glow-card itself since the card's background would paint over it.
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
