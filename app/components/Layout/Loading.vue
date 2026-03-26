<script setup lang="ts">
import { useInitialUserPreferences } from '@/composables/useInitialUserPreferences'

// Add loading state to prevent FOUC (Flash of Unstyled Content)
const isLoading = ref(true)
const isFadingOut = ref(false)
const isContentReady = ref(false)

const { applyUserPreferences } = useInitialUserPreferences()

// Load content and then fade out loading screen
onMounted(async () => {
  if (import.meta.client) {
    // Block on user preferences so the correct theme and light/dark mode are
    // already applied before the loading screen lifts. This is a no-op for
    // guests - the composable guards against a null user internally.
    await applyUserPreferences()

    // Mark content as ready first (render behind loading screen)
    setTimeout(() => {
      isContentReady.value = true

      // Then start the fade-out animation
      setTimeout(() => {
        isFadingOut.value = true

        // Remove the loading screen after animation completes
        setTimeout(() => {
          isLoading.value = false
        }, 500) // Match this to the transition duration in CSS
      }, 100) // Short delay to ensure content is rendered
    }, 100)
  }
})
</script>

<template>
  <!-- Loading overlay that fades out -->
  <div v-if="isLoading" class="initial-loading" :class="{ 'fade-out': isFadingOut }">
    <img src="/logo.svg" alt="" width="200" class="logo-animation">
  </div>
</template>

<style lang="scss">
/* Loading state styles */

.initial-loading {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: var(--dark-color-bg);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  opacity: 1;

  transition:
    opacity 0.5s ease,
    background-color 0.5s ease;

  &.fade-out {
    opacity: 0;
  }

  .logo-animation {
    animation: fadeUp 0.4s ease-out;
  }
}

@keyframes fadeUp {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}
</style>
