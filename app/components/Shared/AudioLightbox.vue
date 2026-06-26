<script setup lang="ts">
import { Flex, Modal } from '@dolanske/vui'
import { computed } from 'vue'
import AudioSpectrogram from '@/components/Shared/AudioSpectrogram.vue'
import AudioTransport from '@/components/Shared/AudioTransport.vue'

// The single global fullscreen player. Mounted once in app.vue, it reads the
// shared engine and shows whatever track is active, so every inline AudioPlayer
// can pop it without each owning a modal. The spectrogram doubles as a giant
// timeline, the transport below carries the familiar play/pause and scrubber.

const player = useAudioPlayer()

const hasTrack = computed(() => player.currentSrc.value != null)

function onSeekInput(time: number) {
  player.seeking.value = true
  player.currentTime.value = time
}

// Spectrogram click/drag seeks the live engine.
function onSpectrogramSeek(time: number) {
  player.currentTime.value = time
}

function onSpectrogramSeekEnd() {
  player.commitSeek()
}

// Space toggles playback while the view is open, the way a video player would.
useEventListener('keydown', (event) => {
  if (!player.fullscreen.value)
    return
  if (event.key === ' ' || event.code === 'Space') {
    event.preventDefault()
    player.togglePlayback()
  }
})
</script>

<template>
  <Modal
    class="audio-lightbox"
    size="screen"
    :open="player.fullscreen.value"
    centered
    @close="player.closeFullscreen()"
  >
    <template #header>
      <Flex column gap="xxs" class="audio-lightbox__titles">
        <span v-if="player.title.value" class="audio-lightbox__title">{{ player.title.value }}</span>
        <span v-else class="audio-lightbox__title">Audio</span>
        <span v-if="player.subtitle.value" class="audio-lightbox__subtitle text-s text-color-lighter">{{ player.subtitle.value }}</span>
      </Flex>
    </template>

    <Flex v-if="hasTrack" column gap="m" class="audio-lightbox__body">
      <div class="audio-lightbox__viz">
        <AudioSpectrogram
          :src="player.currentSrc.value!"
          :progress="player.duration.value ? player.currentTime.value / player.duration.value : 0"
          :duration="player.duration.value"
          @seek-start="player.seeking.value = true"
          @seek="onSpectrogramSeek"
          @seek-end="onSpectrogramSeekEnd"
        />
      </div>

      <AudioTransport
        class="audio-lightbox__transport"
        seekable
        :playing="player.playing.value"
        :loading="player.loading.value"
        :errored="player.errored.value"
        :current-time="player.currentTime.value"
        :duration="player.duration.value"
        @toggle="player.togglePlayback()"
        @seek-input="onSeekInput"
        @seek-commit="player.commitSeek()"
      />
    </Flex>
  </Modal>
</template>

<style lang="scss">
.audio-lightbox {
  --height: calc(100vh - 136px);
  --width: calc(100vw - 32px);

  // Match the lightbox trick: let the card content stretch to the screen size.
  & > .vui-card .vui-card-content > div {
    display: contents !important;
  }

  &__body {
    height: var(--height);
    width: var(--width);
  }

  &__titles {
    min-width: 0;
  }

  &__title {
    font-size: var(--font-size-l);
    font-weight: var(--font-weight-semibold);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__subtitle {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  // The spectrogram takes all the height the header and transport leave behind.
  &__viz {
    flex: 1;
    min-height: 0;
    width: 100%;
  }

  &__transport {
    flex-shrink: 0;
  }
}
</style>
