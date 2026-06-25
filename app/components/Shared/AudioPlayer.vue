<script setup lang="ts">
import { Button, Flex, Spinner } from '@dolanske/vui'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{
  // The audio source URL.
  src: string
  // Filename or track title shown above the scrubber.
  title?: string
  // Optional secondary line (content type, size, uploader, whatever the caller has).
  subtitle?: string
  // Tighter single-row layout for lists and inline use. The full layout stacks
  // the title above the controls.
  compact?: boolean
  // Drop the player's own surface (background, border, padding) when it sits
  // inside a container that already provides one, like the asset drawer preview.
  bare?: boolean
}>()

const audio = ref<HTMLAudioElement | null>(null)
const playing = ref(false)
const duration = ref(0)
const currentTime = ref(0)
const loading = ref(false)
const errored = ref(false)
// While the user drags the scrubber we hold playback updates so the thumb
// doesn't jump back to the element's time mid-drag.
const seeking = ref(false)

const progress = computed(() => {
  if (!duration.value)
    return 0
  return (currentTime.value / duration.value) * 100
})

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0)
    return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function togglePlay() {
  const el = audio.value
  if (!el)
    return
  if (el.paused)
    el.play().catch(() => { errored.value = true })
  else
    el.pause()
}

function onLoadedMetadata() {
  if (audio.value)
    duration.value = audio.value.duration
  loading.value = false
}

function onTimeUpdate() {
  if (audio.value && !seeking.value)
    currentTime.value = audio.value.currentTime
}

// Drive seeking off the range input so click, drag and keyboard all work.
function onSeekInput(event: Event) {
  seeking.value = true
  const value = Number((event.target as HTMLInputElement).value)
  currentTime.value = (value / 100) * duration.value
}

function onSeekCommit() {
  if (audio.value)
    audio.value.currentTime = currentTime.value
  seeking.value = false
}

function onError() {
  errored.value = true
  loading.value = false
}

// Reset everything when the source swaps (e.g. the drawer moves to another file).
watch(() => props.src, () => {
  playing.value = false
  duration.value = 0
  currentTime.value = 0
  errored.value = false
  loading.value = true
})

onBeforeUnmount(() => {
  audio.value?.pause()
})
</script>

<template>
  <div
    class="audio-player" :class="{ 'audio-player--compact': compact,
                                   'audio-player--error': errored,
                                   'audio-player--bare': bare }"
  >
    <audio
      ref="audio"
      :src="src"
      preload="metadata"
      @loadedmetadata="onLoadedMetadata"
      @timeupdate="onTimeUpdate"
      @play="playing = true"
      @pause="playing = false"
      @ended="playing = false"
      @waiting="loading = true"
      @playing="loading = false"
      @error="onError"
    />

    <Button
      class="audio-player__toggle"
      variant="accent"
      square
      :disabled="errored"
      :aria-label="playing ? 'Pause' : 'Play'"
      @click="togglePlay"
    >
      <Spinner v-if="loading && playing" size="s" />
      <Icon v-else :name="playing ? 'ph:pause-fill' : 'ph:play-fill'" size="18" />
    </Button>

    <Flex column :gap="0" expand class="audio-player__body">
      <Flex v-if="title || subtitle" x-between y-center gap="s" class="audio-player__meta">
        <span v-if="title" class="audio-player__title text-s">{{ title }}</span>
        <span v-if="subtitle" class="audio-player__subtitle text-xs text-color-lighter">{{ subtitle }}</span>
      </Flex>

      <Flex y-center gap="s" expand class="audio-player__controls">
        <span class="audio-player__time text-xs text-color-lighter">{{ formatTime(currentTime) }}</span>

        <div class="audio-player__scrubber">
          <div class="audio-player__track">
            <div class="audio-player__fill" :style="{ width: `${progress}%` }" />
          </div>
          <input
            class="audio-player__range"
            type="range"
            min="0"
            max="100"
            step="0.1"
            :value="progress"
            :disabled="errored || !duration"
            aria-label="Seek"
            @input="onSeekInput"
            @change="onSeekCommit"
            @mouseup="onSeekCommit"
            @touchend="onSeekCommit"
          >
        </div>

        <span class="audio-player__time text-xs text-color-lighter">{{ formatTime(duration) }}</span>
      </Flex>

      <span v-if="errored" class="audio-player__error-text text-xs text-color-red">Could not load audio.</span>
    </Flex>
  </div>
</template>

<style scoped lang="scss">
.audio-player {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  width: 100%;
  padding: var(--space-s);
  border-radius: var(--border-radius-l);
  background: var(--color-bg-raised);
  border: 1px solid var(--color-border-subtle);

  &--compact {
    padding: var(--space-xs);
    gap: var(--space-xs);

    .audio-player__toggle {
      align-self: center;
    }
  }

  &--bare {
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 0;
  }

  &--error .audio-player__toggle {
    opacity: 0.6;
  }

  &__toggle {
    flex-shrink: 0;
    align-self: flex-start;
  }

  &__body {
    min-width: 0;
  }

  &__meta {
    margin-bottom: var(--space-xxs);
  }

  &__title {
    color: var(--color-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  &__subtitle {
    white-space: nowrap;
    flex-shrink: 0;
  }

  &__controls {
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
