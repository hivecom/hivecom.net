<script setup lang="ts">
// Add loading state to prevent FOUC (Flash of Unstyled Content)
const isLoading = ref(true)
const isFadingOut = ref(false)
const isContentReady = ref(false)

// Load content and then fade out loading screen
onMounted(() => {
  if (process.client) {
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
  <div class="app-container">
    <div class="content-container">
      <NuxtLoadingIndicator />
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </div>

    <!-- Loading overlay that fades out -->
    <div v-if="isLoading" class="initial-loading" :class="{ 'fade-out': isFadingOut }">
      <img src="/logo.svg" alt="Hivecom" width="200" class="logo-animation">
    </div>
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
  background-color: var(--color-bg);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  opacity: 1;
  transition: opacity 0.5s ease;

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
