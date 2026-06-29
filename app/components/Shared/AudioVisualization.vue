<script setup lang="ts">
// PLACEHOLDER. A new fullscreen-player visualization, to be implemented by a
// follow-up. It takes the same inputs as the other visualizers (AudioSpectrum,
// AudioWaveform) so the real implementation can drop straight in: decode via
// lib/audio/decode, read `progress`/`duration` for the playhead, and only run a
// loop while `playing`. See AudioSpectrum.vue for the established pattern.

defineProps<{
  // Track URL.
  src: string
  // Playback position as a 0..1 fraction.
  progress: number
  // Total duration in seconds.
  duration: number
  // Whether the engine is playing.
  playing: boolean
}>()
</script>

<template>
  <div class="audio-visualization">
    <span class="audio-visualization__label text-s text-color-lighter">Visualization</span>
  </div>
</template>

<style scoped lang="scss">
.audio-visualization {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  // Dashed framing so the empty panel reads as an intentional placeholder.
  border: 1px dashed var(--color-border);
  border-radius: var(--border-radius-m);

  &__label {
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
}
</style>
