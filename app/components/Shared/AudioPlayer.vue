<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import AudioEqualizer from '@/components/Shared/AudioEqualizer.vue'
import AudioTransport from '@/components/Shared/AudioTransport.vue'

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

// A view of the shared playback engine bound to one src. Actual playback lives
// in useAudioPlayer so it survives navigation and list re-renders, with the
// persistent toast as the other view. When this instance owns the active track
// it reflects and drives the engine live; otherwise it sits idle and a press
// hands the track over to the engine. The transport renders the controls.
const player = useAudioPlayer()

const isActive = computed(() => player.currentSrc.value === props.src)

// A metadata-only probe so idle players can still show the total duration in
// lists, the way they did when each owned its own element. It never plays.
const probe = ref<HTMLAudioElement | null>(null)
const localDuration = ref(0)
const localErrored = ref(false)

const displayPlaying = computed(() => isActive.value && player.playing.value)
const displayLoading = computed(() => isActive.value && player.loading.value)
const displayErrored = computed(() => (isActive.value ? player.errored.value : localErrored.value))
const displayCurrentTime = computed(() => (isActive.value ? player.currentTime.value : 0))
const displayDuration = computed(() => (isActive.value ? player.duration.value : localDuration.value))

function togglePlay() {
  player.toggle({ src: props.src, title: props.title, subtitle: props.subtitle })
}

function onProbeMeta() {
  if (probe.value)
    localDuration.value = probe.value.duration
}

function onProbeError() {
  localErrored.value = true
}

function onSeekInput(time: number) {
  player.seeking.value = true
  player.currentTime.value = time
}

function onSeekCommit() {
  player.commitSeek()
}

// Reset the idle probe state when the source swaps (e.g. the drawer moves to
// another file).
watch(() => props.src, () => {
  localDuration.value = 0
  localErrored.value = false
})
</script>

<template>
  <div
    class="audio-player" :class="{ 'audio-player--compact': compact,
                                   'audio-player--bare': bare }"
  >
    <!-- Metadata-only probe so an idle player can show the track length. The
         engine owns the element that actually plays, so this never does. -->
    <audio
      v-if="!isActive"
      ref="probe"
      :src="src"
      preload="metadata"
      @loadedmetadata="onProbeMeta"
      @error="onProbeError"
    />

    <AudioTransport
      :playing="displayPlaying"
      :loading="displayLoading"
      :errored="displayErrored"
      :current-time="displayCurrentTime"
      :duration="displayDuration"
      :seekable="isActive"
      :compact="compact"
      @toggle="togglePlay"
      @seek-input="onSeekInput"
      @seek-commit="onSeekCommit"
    >
      <template v-if="title || subtitle" #meta>
        <Flex x-between y-center gap="s" expand class="audio-player__meta">
          <span v-if="title" class="audio-player__title text-s">{{ title }}</span>
          <span v-else aria-hidden="true" />
          <Flex y-center gap="s" class="audio-player__meta-end">
            <span v-if="subtitle" class="audio-player__subtitle text-xs text-color-lighter">{{ subtitle }}</span>
            <AudioEqualizer :playing="displayPlaying" />
          </Flex>
        </Flex>
      </template>
    </AudioTransport>
  </div>
</template>

<style scoped lang="scss">
.audio-player {
  width: 100%;
  padding: var(--space-s);
  border-radius: var(--border-radius-l);
  background: var(--color-bg-raised);
  border: 1px solid var(--color-border-subtle);
  transition: border-color var(--transition);

  &:not(.audio-player--bare):hover {
    border-color: var(--color-border);
  }

  &--compact {
    padding: var(--space-xs);
  }

  &--bare {
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 0;
  }

  &__meta {
    margin-bottom: var(--space-xxs);
  }

  &__meta-end {
    flex-shrink: 0;
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
}
</style>
