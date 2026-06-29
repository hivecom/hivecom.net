<script setup lang="ts">
import { Button, PopoutHover } from '@dolanske/vui'
import { computed, ref } from 'vue'

// Volume control. The trigger opens a vertical fader on hover via a teleported
// VUI popout, so it never gets clipped or vanishes mid-reach. Scroll over the
// trigger or fader to nudge the level, click to mute. Engine-controlled.
//
// Default trigger is a square button (matches the play toggle in the fullscreen
// player). `bare` swaps it for a plain icon that sits inline next to other small
// affordances, like the inline player's expand glyph.

const props = defineProps<{
  // 0..1 output level.
  volume: number
  muted: boolean
  // Render the trigger as a bare inline icon instead of a square button.
  bare?: boolean
}>()

const emit = defineEmits<{
  setVolume: [value: number]
  toggleMute: []
}>()

const SCROLL_STEP = 0.05

// The fader reads zero while muted so the fill matches what you hear.
const shown = computed(() => (props.muted ? 0 : props.volume))

const icon = computed(() => {
  if (props.muted || props.volume === 0)
    return 'ph:speaker-simple-x'
  if (props.volume < 0.5)
    return 'ph:speaker-simple-low'
  return 'ph:speaker-simple-high'
})

const track = ref<HTMLElement | null>(null)
let dragging = false

// Map a pointer y onto a 0..1 level, top of the track being full volume.
function levelFromEvent(event: PointerEvent): number {
  const el = track.value
  if (!el)
    return props.volume
  const rect = el.getBoundingClientRect()
  return Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height))
}

function onDown(event: PointerEvent) {
  dragging = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  emit('setVolume', levelFromEvent(event))
}

function onMove(event: PointerEvent) {
  if (dragging)
    emit('setVolume', levelFromEvent(event))
}

function onUp(event: PointerEvent) {
  dragging = false
  ;(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId)
}

// Scroll up to raise, down to lower.
function onWheel(event: WheelEvent) {
  const delta = event.deltaY < 0 ? SCROLL_STEP : -SCROLL_STEP
  emit('setVolume', Math.max(0, Math.min(1, shown.value + delta)))
}
</script>

<template>
  <PopoutHover placement="top" :offset="8">
    <template #trigger>
      <span
        v-if="bare"
        class="audio-volume__trigger"
        role="button"
        tabindex="0"
        :aria-label="muted ? 'Unmute' : 'Mute'"
        @click="emit('toggleMute')"
        @keydown.enter.prevent="emit('toggleMute')"
        @keydown.space.prevent="emit('toggleMute')"
        @wheel.prevent="onWheel"
      >
        <Icon :name="icon" :size="14" />
      </span>
      <Button
        v-else
        square
        :aria-label="muted ? 'Unmute' : 'Mute'"
        @click="emit('toggleMute')"
        @wheel.prevent="onWheel"
      >
        <Icon :name="icon" :size="18" />
      </Button>
    </template>

    <div class="audio-volume" @wheel.prevent="onWheel">
      <span class="audio-volume__readout text-xs text-color-lighter">{{ Math.round(shown * 100) }}</span>
      <div
        ref="track"
        class="audio-volume__track"
        :style="{ '--level': `${shown * 100}%` }"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
      >
        <div class="audio-volume__fill" />
        <div class="audio-volume__thumb" />
      </div>
    </div>
  </PopoutHover>
</template>

<style scoped lang="scss">
// Bare trigger: a small inline icon that matches the inline player's expand glyph.
.audio-volume__trigger {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  color: var(--color-text-lighter);
  transition: color var(--transition);

  &:hover,
  &:focus-visible {
    color: var(--color-accent);
  }
}

.audio-volume {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-s) var(--space-xs);

  &__readout {
    font-variant-numeric: tabular-nums;
    // Fixed width so the popup doesn't resize as the number goes 0 -> 100.
    min-width: 3.5ch;
    text-align: center;
  }

  &__track {
    position: relative;
    width: 6px;
    height: 96px;
    border-radius: var(--border-radius-pill);
    background: var(--color-border);
    cursor: pointer;
    touch-action: none;
  }

  &__fill {
    position: absolute;
    inset-inline: 0;
    bottom: 0;
    height: var(--level);
    border-radius: inherit;
    background: var(--color-accent);
  }

  &__thumb {
    position: absolute;
    left: 50%;
    bottom: var(--level);
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--color-accent);
    border: 2px solid var(--color-bg);
    transform: translate(-50%, 50%);
    pointer-events: none;
  }
}
</style>
