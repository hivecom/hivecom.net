<script setup lang="ts">
import { computed } from 'vue'
import AudioPlayButton from '@/components/Shared/AudioPlayButton.vue'
import { formatClock } from '@/lib/utils/duration'

// The shared transport: play/pause button, scrubber and time labels. Both the
// inline AudioPlayer and the persistent toast render this so there's one copy of
// the controls. It's fully controlled, it holds no playback state of its own,
// the parent feeds it values and handles the events.

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
</script>

<template>
  <div
    class="audio-transport"
    :class="{ 'audio-transport--compact': compact,
              'audio-transport--playing': playing }"
  >
    <AudioPlayButton
      class="audio-transport__toggle"
      :playing="playing"
      :loading="loading"
      :errored="errored"
      @toggle="emit('toggle')"
    />

    <div class="audio-transport__body">
      <slot name="meta" />

      <div class="audio-transport__controls">
        <span class="audio-transport__time text-xs text-color-lighter">{{ formatClock(currentTime) }}</span>

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

        <span class="audio-transport__time text-xs text-color-lighter">{{ formatClock(duration) }}</span>
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

  &__toggle {
    align-self: flex-start;
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
</style>
