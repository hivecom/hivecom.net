<script setup lang="ts">
import { Button } from '@dolanske/vui'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

// The play/pause toggle with the morphing glyph. Pulled out of AudioTransport so
// the fullscreen player can place it on its own without rebuilding the icon. It's
// fully controlled: the parent feeds state and handles the toggle.

const props = defineProps<{
  playing: boolean
  loading: boolean
  errored: boolean
  // Bump the button and glyph up a size. Used on mobile, where it's the primary
  // touch target.
  large?: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()

// The play triangle is split down the middle into two halves. Each tweens into
// one of the pause bars so the icon folds open. The four point pairs line up
// across both shapes, so we just lerp them. We interpolate in JS rather than via
// a CSS `d` transition, which Firefox doesn't animate.
const PLAY_LEFT = [8, 5, 13.5, 8.5, 13.5, 15.5, 8, 19]
const PAUSE_LEFT = [6.5, 5, 10, 5, 10, 19, 6.5, 19]
const PLAY_RIGHT = [13.5, 8.5, 19, 12, 19, 12, 13.5, 15.5]
const PAUSE_RIGHT = [14, 5, 17.5, 5, 17.5, 19, 14, 19]

// 0 = play triangle, 1 = pause bars. Seeded from the live state so an instance
// that mounts onto an already-playing track shows the pause icon right away.
const morph = ref(props.playing ? 1 : 0)

function pathFor(from: number[], to: number[], t: number): string {
  const p = from.map((v, i) => v + ((to[i] ?? v) - v) * t)
  return `M${p[0]} ${p[1]} L${p[2]} ${p[3]} L${p[4]} ${p[5]} L${p[6]} ${p[7]} Z`
}

const iconLeft = computed(() => pathFor(PLAY_LEFT, PAUSE_LEFT, morph.value))
const iconRight = computed(() => pathFor(PLAY_RIGHT, PAUSE_RIGHT, morph.value))

// Buffering/seeking the active track. The play/pause glyph melts away and a
// spinning ring takes its place inside the same SVG, so there's never a blank
// frame between the two.
const isLoading = computed(() => props.loading && props.playing)

// Hand-rolled tween so the morph plays everywhere, not just browsers that
// animate the CSS `d` property.
let morphRaf: number | null = null

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2
}

function animateMorph(target: number) {
  if (morphRaf !== null)
    cancelAnimationFrame(morphRaf)

  const reduce = import.meta.client && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const from = morph.value
  const delta = target - from
  if (reduce || delta === 0) {
    morph.value = target
    return
  }

  const start = performance.now()
  const total = 260
  const step = (now: number) => {
    const t = Math.min((now - start) / total, 1)
    morph.value = from + delta * easeInOut(t)
    morphRaf = t < 1 ? requestAnimationFrame(step) : null
  }
  morphRaf = requestAnimationFrame(step)
}

watch(() => props.playing, value => animateMorph(value ? 1 : 0))

onBeforeUnmount(() => {
  if (morphRaf !== null)
    cancelAnimationFrame(morphRaf)
})
</script>

<template>
  <Button
    class="audio-play-button"
    :class="{
      'audio-play-button--error': errored,
      'audio-play-button--large': large,
    }"
    variant="accent"
    square
    :size="large ? 'l' : 'm'"
    :disabled="errored"
    :aria-label="playing ? 'Pause' : 'Play'"
    @click="emit('toggle')"
  >
    <!-- Inline SVG so the two halves can morph between the play triangle and the
         pause bars (no Iconify name swap, no blank frame). The same SVG also holds
         the buffering ring so the glyph can melt into it when the track is seeking
         instead of cutting to nothing. -->
    <svg
      class="audio-play-button__icon"
      :class="{ 'audio-play-button__icon--loading': isLoading }"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <g class="audio-play-button__glyph">
        <path :d="iconLeft" />
        <path :d="iconRight" />
      </g>
      <circle class="audio-play-button__ring" cx="12" cy="12" r="7" fill="none" />
    </svg>
  </Button>
</template>

<style scoped lang="scss">
.audio-play-button {
  flex-shrink: 0;
  overflow: visible;
  transition: transform var(--transition);

  &:hover {
    transform: scale(1.06);
  }

  &:active {
    transform: scale(0.95);
  }

  &--error {
    opacity: 0.6;
  }

  &__icon {
    display: block;
    width: 18px;
    height: 18px;

    path {
      fill: currentColor;
    }
  }

  &--large &__icon {
    width: 24px;
    height: 24px;
  }

  // The play/pause glyph and the buffering ring share the icon's center and
  // cross-fade: the glyph shrinks out of view while the ring scales up and
  // starts spinning. No blank frame in between.
  &__glyph,
  &__ring {
    transform-box: view-box;
    transform-origin: center;
  }

  &__glyph {
    transition:
      transform var(--transition),
      opacity var(--transition);
  }

  &__ring {
    stroke: currentColor;
    stroke-width: 2.5;
    stroke-linecap: round;
    // ~60% of the 7px-radius circumference drawn, the rest left as the gap.
    stroke-dasharray: 27 17;
    opacity: 0;
    transform: scale(0.5);
    transition:
      transform var(--transition),
      opacity var(--transition);
  }

  &__icon--loading {
    .audio-play-button__glyph {
      opacity: 0;
      transform: scale(0.5);
    }

    .audio-play-button__ring {
      opacity: 1;
      animation: audio-play-button-spin 0.8s linear infinite;
    }
  }
}

@keyframes audio-play-button-spin {
  from {
    transform: scale(1) rotate(0deg);
  }
  to {
    transform: scale(1) rotate(360deg);
  }
}

// Drop the spin but still swap the glyph for the static ring so the loading state
// stays legible without motion.
@media (prefers-reduced-motion: reduce) {
  .audio-play-button__icon--loading .audio-play-button__ring {
    animation: none;
    transform: scale(1);
  }
}
</style>
