<script setup lang="ts">
import { Button, Card, Flex } from '@dolanske/vui'
import { onMounted, onUnmounted } from 'vue'
import AudioEqualizer from '@/components/Shared/AudioEqualizer.vue'
import AudioTransport from '@/components/Shared/AudioTransport.vue'
import AudioVolume from '@/components/Shared/AudioVolume.vue'

// The persistent mini-player reads the shared engine directly, so it stays in lockstep
// with any inline AudioPlayer on the same source. It deliberately does NOT close on
// route change.

interface Props {
  // bodyProps is empty, all state comes from the composable. Declared so the
  // container's :data binding doesn't fall through as a stray attribute.
  data?: Record<string, never>
  toastId: number
}

const { toastId } = defineProps<Props>()

const player = useAudioPlayer()

function onSeekInput(time: number) {
  player.seeking.value = true
  player.currentTime.value = time
}

function openFullscreen() {
  player.openFullscreen({
    src: player.currentSrc.value!,
    title: player.title.value,
    subtitle: player.subtitle.value,
  })
}

// Publish the docked footprint as a CSS variable while mounted so the mobile chat
// composer can reserve room above the toast. It goes away on unmount.
let dockObserver: ResizeObserver | null = null

onMounted(() => {
  if (!import.meta.client)
    return

  // A toast with a custom body renders the body component straight into the
  // toast list, with no .vui-toast-item wrapper, so our Card is the toast item.
  // There's only ever one audio toast, so the class is unique.
  const card = document.querySelector('.toast-audio') as HTMLElement | null
  if (!card)
    return

  dockObserver = new ResizeObserver(() => {
    // Card height plus 12px of breathing room.
    document.documentElement.style.setProperty('--audio-dock-height', `${card.offsetHeight + 12}px`)
  })
  dockObserver.observe(card)
})

// Any path that removes this toast (close button or an external removal) tears
// playback down with it.
onUnmounted(() => {
  dockObserver?.disconnect()
  if (import.meta.client)
    document.documentElement.style.removeProperty('--audio-dock-height')
  player.handleToastUnmount(toastId)
})
</script>

<template>
  <Card v-show="!player.fullscreen.value" :padding="false" expand class="toast-audio">
    <AudioTransport
      class="toast-audio__transport"
      compact
      seekable
      :playing="player.playing.value"
      :loading="player.loading.value"
      :errored="player.errored.value"
      :current-time="player.currentTime.value"
      :duration="player.duration.value"
      @toggle="player.togglePlayback()"
      @seek-input="onSeekInput"
      @seek-commit="player.commitSeek()"
    >
      <template #meta>
        <Flex x-between y-center gap="s" expand class="toast-audio__meta">
          <Flex y-center gap="xs" class="toast-audio__meta-start">
            <img
              v-if="player.tags.value?.cover"
              :src="player.tags.value.cover"
              alt=""
              class="toast-audio__cover"
            >
            <span v-if="player.title.value" class="toast-audio__title">{{ player.title.value }}</span>
            <span v-else aria-hidden="true" />
          </Flex>
          <Flex y-center gap="xxs" class="toast-audio__`">
            <!-- Clickable affordance, deliberately not a Button: the equalizer and
                 the expand glyph together open the fullscreen view. -->
            <span
              class="toast-audio__expand"
              role="button"
              tabindex="0"
              aria-label="Open fullscreen player"
              title="Open fullscreen player"
              @click="openFullscreen"
              @keydown.enter.prevent="openFullscreen"
              @keydown.space.prevent="openFullscreen"
            >
              <AudioEqualizer :playing="player.playing.value" />
              <Icon name="ph:arrows-out-simple" :size="14" />
            </span>
            <AudioVolume
              bare
              :volume="player.volume.value"
              :muted="player.muted.value"
              @set-volume="player.setVolume"
              @toggle-mute="player.toggleMute()"
            />
          </Flex>
        </Flex>
      </template>

      <template #trailing>
        <Button
          size="m"
          variant="gray"
          square
          aria-label="Stop"
          class="toast-audio__close"
          @click="player.stop()"
        >
          <Icon name="ph:x" :size="14" />
        </Button>
      </template>
    </AudioTransport>
  </Card>
</template>

<style scoped lang="scss">
.toast-audio {
  &__transport {
    padding: var(--space-xs);
    min-height: 52px;
  }

  &__meta {
    margin-bottom: var(--space-xxs);
  }

  &__meta-start {
    min-width: 0;
  }

  // Hidden when a track has no embedded art
  &__cover {
    border-radius: var(--border-radius-xs);
    flex-shrink: 0;
    height: 28px;
    object-fit: cover;
    width: 28px;
  }

  &__meta-end {
    flex-shrink: 0;
  }

  &__title {
    display: block;
    font-size: var(--font-size-s);
    font-weight: var(--font-weight-semibold);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  &__expand {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    flex-shrink: 0;
    cursor: pointer;
    color: var(--color-text-lighter);
    transition: color var(--transition);

    &:hover {
      color: var(--color-accent);
    }
  }

  &__close {
    flex-shrink: 0;
    align-self: center;
  }
}
</style>
