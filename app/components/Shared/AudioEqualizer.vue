<script setup lang="ts">
// The little bouncing bars that signal an active track is playing. Driven purely
// by the `playing` prop so any surface (the inline AudioPlayer, the persistent
// toast) can drop it in and stay in sync with the shared engine.
defineProps<{
  playing: boolean
}>()
</script>

<template>
  <!-- Stays mounted so the bars collapse to zero smoothly when playback stops
       instead of popping out. -->
  <span class="audio-eq" :class="{ 'audio-eq--playing': playing }" aria-hidden="true">
    <span /><span /><span /><span />
  </span>
</template>

<style scoped lang="scss">
// The container scales down to zero when stopped so the whole bar group melts
// away smoothly. Bars inside keep their out-of-phase bounce while playing.
.audio-eq {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  width: 16px;
  height: 12px;
  flex-shrink: 0;
  transform-origin: bottom;
  transform: scaleY(0);
  opacity: 0;
  transition:
    transform var(--transition-slow),
    opacity var(--transition-slow);

  &--playing {
    transform: scaleY(1);
    opacity: 1;
  }

  span {
    flex: 1;
    height: 100%;
    border-radius: 1px;
    background: var(--color-accent);
    transform-origin: bottom;
    // Keeps bouncing through the collapse so the bars stay alive as the group
    // melts to zero, rather than freezing the moment playback stops.
    animation: audio-eq-bounce 0.9s ease-in-out infinite;

    &:nth-child(1) {
      animation-delay: -0.3s;
    }
    &:nth-child(2) {
      animation-delay: -0.1s;
    }
    &:nth-child(3) {
      animation-delay: -0.45s;
    }
    &:nth-child(4) {
      animation-delay: -0.2s;
    }
  }
}

@keyframes audio-eq-bounce {
  0%,
  100% {
    transform: scaleY(0.25);
  }

  50% {
    transform: scaleY(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .audio-eq span {
    animation: none;
    transform: scaleY(0.6);
  }
}
</style>
