<script setup lang="ts">
import { Button } from '@dolanske/vui'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

// The shared transport: play/pause button, morphing icon, scrubber and time
// labels. Both the inline AudioPlayer and the persistent toast render this so
// there's one copy of the controls. It's fully controlled, it holds no playback
// state of its own, the parent feeds it values and handles the events.

const props = defineProps<{
  playing: boolean
  loading: boolean
  errored: boolean
  currentTime: number
  duration: number
  // Whether the scrubber actually seeks. An idle inline player shows the track
  // length but can't be dragged until it owns the active track.
  seekable: boolean
  // Tighter spacing and a centered toggle, for lists and the mini-player.
  compact?: boolean
}>()

const emit = defineEmits<{
  toggle: []
  seekInput: [time: number]
  seekCommit: []
}>()

const progress = computed(() => {
  if (!props.duration)
    return 0
  return (props.currentTime / props.duration) * 100
})

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

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0)
    return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Drive seeking off the range input so click, drag and keyboard all work. The
// parent owns currentTime, so we just hand it the new time and let the prop flow
// back, which keeps the thumb from fighting playback updates mid-drag.
function onSeekInput(event: Event) {
  if (!props.seekable)
    return
  const value = Number((event.target as HTMLInputElement).value)
  emit('seekInput', (value / 100) * props.duration)
}

function onSeekCommit() {
  if (props.seekable)
    emit('seekCommit')
}

onBeforeUnmount(() => {
  if (morphRaf !== null)
    cancelAnimationFrame(morphRaf)
})
</script>

<template>
  <div
    class="audio-transport"
    :class="{ 'audio-transport--compact': compact,
              'audio-transport--playing': playing,
              'audio-transport--error': errored }"
  >
    <Button
      class="audio-transport__toggle"
      variant="accent"
      square
      :disabled="errored"
      :aria-label="playing ? 'Pause' : 'Play'"
      @click="emit('toggle')"
    >
      <!-- Inline SVG so the two halves can morph between the play triangle and
           the pause bars (no Iconify name swap, no blank frame). The same SVG
           also holds the buffering ring so the glyph can melt into it when the
           track is seeking instead of cutting to nothing. -->
      <svg
        class="audio-transport__icon"
        :class="{ 'audio-transport__icon--loading': isLoading }"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <g class="audio-transport__glyph">
          <path :d="iconLeft" />
          <path :d="iconRight" />
        </g>
        <circle class="audio-transport__ring" cx="12" cy="12" r="7" fill="none" />
      </svg>
    </Button>

    <div class="audio-transport__body">
      <slot name="meta" />

      <div class="audio-transport__controls">
        <span class="audio-transport__time text-xs text-color-lighter">{{ formatTime(currentTime) }}</span>

        <div class="audio-transport__scrubber">
          <div class="audio-transport__track">
            <div class="audio-transport__fill" :style="{ width: `${progress}%` }" />
          </div>
          <input
            class="audio-transport__range"
            type="range"
            min="0"
            max="100"
            step="0.1"
            :value="progress"
            :disabled="errored || !seekable"
            aria-label="Seek"
            @input="onSeekInput"
            @change="onSeekCommit"
            @mouseup="onSeekCommit"
            @touchend="onSeekCommit"
          >
        </div>

        <span class="audio-transport__time text-xs text-color-lighter">{{ formatTime(duration) }}</span>
      </div>

      <span v-if="errored" class="audio-transport__error-text text-xs text-color-red">Could not load audio.</span>
    </div>

    <slot name="trailing" />
  </div>
</template>

<style scoped lang="scss">
.audio-transport {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  width: 100%;

  &--compact {
    gap: var(--space-xs);

    .audio-transport__toggle {
      align-self: center;
    }
  }

  &--error .audio-transport__toggle {
    opacity: 0.6;
  }

  &__toggle {
    flex-shrink: 0;
    align-self: flex-start;
    overflow: visible;
    transition: transform var(--transition);

    &:hover {
      transform: scale(1.06);
    }

    &:active {
      transform: scale(0.95);
    }
  }

  &__icon {
    display: block;
    width: 18px;
    height: 18px;

    path {
      fill: currentColor;
    }
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
    .audio-transport__glyph {
      opacity: 0;
      transform: scale(0.5);
    }

    .audio-transport__ring {
      opacity: 1;
      animation: audio-transport-spin 0.8s linear infinite;
    }
  }

  &__body {
    min-width: 0;
    flex: 1;
  }

  &__controls {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    width: 100%;
  }

  &__time {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
    min-width: 2.5rem;

    &:last-child {
      text-align: right;
    }
  }

  &__scrubber {
    position: relative;
    flex: 1;
    min-width: 0;
    height: 16px;
    display: flex;
    align-items: center;
  }

  &__track {
    position: absolute;
    inset-inline: 0;
    height: 4px;
    border-radius: var(--border-radius-xs);
    background: var(--color-border);
    overflow: hidden;
  }

  &__fill {
    height: 100%;
    background: var(--color-accent);
    border-radius: inherit;
    transition: box-shadow var(--transition);
  }

  &--playing &__fill {
    box-shadow: 0 0 8px -1px var(--color-accent);
  }

  // Transparent native range sits on top of the painted track so we get real
  // drag, click and keyboard seeking without rebuilding pointer math.
  &__range {
    position: relative;
    width: 100%;
    margin: 0;
    background: transparent;
    appearance: none;
    cursor: pointer;

    &:disabled {
      cursor: default;
    }

    &::-webkit-slider-thumb {
      appearance: none;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--color-accent);
      border: 2px solid var(--color-bg);
      cursor: pointer;
    }

    &::-moz-range-thumb {
      width: 12px;
      height: 12px;
      border: 2px solid var(--color-bg);
      border-radius: 50%;
      background: var(--color-accent);
      cursor: pointer;
    }

    &:disabled::-webkit-slider-thumb,
    &:disabled::-moz-range-thumb {
      background: var(--color-border-strong);
    }
  }

  &__error-text {
    margin-top: var(--space-xxs);
  }
}

@keyframes audio-transport-spin {
  from {
    transform: scale(1) rotate(0deg);
  }
  to {
    transform: scale(1) rotate(360deg);
  }
}

// Drop the spin but still swap the glyph for the static ring so the loading
// state stays legible without motion.
@media (prefers-reduced-motion: reduce) {
  .audio-transport__icon--loading .audio-transport__ring {
    animation: none;
    transform: scale(1);
  }
}
</style>
