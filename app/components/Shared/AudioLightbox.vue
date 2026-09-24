<script setup lang="ts">
import { Flex, Modal, Resizable } from '@dolanske/vui'
import { computed } from 'vue'
import AudioPlayButton from '@/components/Shared/AudioPlayButton.vue'
import AudioSpectrum from '@/components/Shared/AudioSpectrum.vue'
import AudioVisualization from '@/components/Shared/AudioVisualization.vue'
import AudioVolume from '@/components/Shared/AudioVolume.vue'
import AudioWaveform from '@/components/Shared/AudioWaveform.vue'
import { useBreakpoint } from '@/lib/mediaQuery'
import { formatClock } from '@/lib/utils/duration'

// The single global fullscreen player, mounted once in app.vue. It shows whatever
// track the shared engine has active, so inline players don't each own a modal.
// The waveform is the timeline (click or drag to seek), so the footer only holds
// the timecode and the play/volume row.

const player = useAudioPlayer()

const hasTrack = computed(() => player.currentSrc.value != null)

// Prefer embedded tag title/artist when present, fall back to the passed
// title/subtitle the engine holds.
const headerTitle = computed(() => player.tags.value?.title ?? player.title.value)
const headerSubtitle = computed(() => player.tags.value?.artist ?? player.subtitle.value)

// On mobile the OS volume keys are the control and the hover fader doesn't work
// on touch, so we drop the in-app fader and grow the play button. The engine
// pins output to full on mobile, so there's nothing to force here.
const isMobile = useBreakpoint('<s')

function onWaveformSeek(time: number) {
  player.currentTime.value = time
}

function onWaveformSeekEnd() {
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
      <Flex y-center gap="s" class="audio-lightbox__header">
        <img
          v-if="player.tags.value?.cover"
          :src="player.tags.value.cover"
          alt=""
          class="audio-lightbox__cover"
        >
        <Flex column gap="xxs" class="audio-lightbox__titles">
          <span v-if="headerTitle" class="audio-lightbox__title">{{ headerTitle }}</span>
          <span v-else class="audio-lightbox__title">Audio</span>
          <span v-if="headerSubtitle" class="audio-lightbox__subtitle text-s text-color-lighter">{{ headerSubtitle }}</span>
        </Flex>
      </Flex>
    </template>

    <Flex v-if="hasTrack" column gap="m" class="audio-lightbox__body">
      <Resizable
        vertical
        :min-size="80"
        storage-key="audio-lightbox-split-v2"
        class="audio-lightbox__split"
      >
        <div class="audio-lightbox__visualization">
          <AudioVisualization
            :src="player.currentSrc.value!"
            :progress="player.duration.value ? player.currentTime.value / player.duration.value : 0"
            :duration="player.duration.value"
            :playing="player.playing.value"
          />
        </div>

        <div class="audio-lightbox__spectrum">
          <AudioSpectrum
            :src="player.currentSrc.value!"
            :progress="player.duration.value ? player.currentTime.value / player.duration.value : 0"
            :duration="player.duration.value"
            :playing="player.playing.value"
            :loading="player.loading.value"
          />
        </div>

        <div class="audio-lightbox__viz">
          <AudioWaveform
            :src="player.currentSrc.value!"
            :progress="player.duration.value ? player.currentTime.value / player.duration.value : 0"
            :duration="player.duration.value"
            @seek-start="player.seeking.value = true"
            @seek="onWaveformSeek"
            @seek-end="onWaveformSeekEnd"
          />
        </div>
      </Resizable>

      <Flex column center gap="s" class="audio-lightbox__footer">
        <span class="audio-lightbox__time text-s text-color-lighter">
          {{ formatClock(player.currentTime.value) }} / {{ formatClock(player.duration.value) }}
        </span>

        <Flex center gap="xxs">
          <AudioPlayButton
            :playing="player.playing.value"
            :loading="player.loading.value"
            :errored="player.errored.value"
            :large="isMobile"
            @toggle="player.togglePlayback()"
          />
          <AudioVolume
            v-if="!isMobile"
            :volume="player.volume.value"
            :muted="player.muted.value"
            @set-volume="player.setVolume"
            @toggle-mute="player.toggleMute()"
          />
        </Flex>
      </Flex>
    </Flex>
  </Modal>
</template>

<style lang="scss">
.audio-lightbox {
  // Make the card content a column and dissolve the slot wrapper, so the body
  // becomes a direct flex child of the full-height content area.
  & > .vui-card .vui-card-content {
    display: flex;
    flex-direction: column;
  }

  & > .vui-card .vui-card-content > div {
    display: contents !important;
  }

  // Grow to fill the content area so the split takes all the height the footer
  // leaves, no fixed-height guesswork.
  &__body {
    flex: 1;
    min-height: 0;
    width: 100%;
  }

  &__split {
    flex: 1;
    min-height: 0;
    width: 100%;
  }

  &__visualization {
    height: 100%;
    width: 100%;
  }

  &__spectrum {
    height: 100%;
    width: 100%;
  }

  &__header {
    min-width: 0;
  }

  // Cover thumbnail beside the titles. Hidden when the track has no embedded art.
  &__cover {
    border-radius: var(--border-radius-s);
    flex-shrink: 0;
    height: 40px;
    object-fit: cover;
    width: 40px;
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

  // The waveform timeline panel, inset to the scrubber width so its edges line
  // up with the progress bar below.
  &__viz {
    height: 100%;
    width: 100%;
  }

  &__footer {
    flex-shrink: 0;
    width: 100%;
  }

  &__time {
    font-variant-numeric: tabular-nums;
  }
}
</style>
