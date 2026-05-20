<script setup lang="ts">
import { Button, Flex } from '@dolanske/vui'
import SharedLogo from '@/components/Shared/Logo.vue'
import SharedSupportModal from '@/components/Shared/SupportModal.vue'
import { useInitialUserPreferences } from '@/composables/useInitialUserPreferences'
import { useSessionReady } from '@/composables/useSessionReady'

// Add loading state to prevent FOUC (Flash of Unstyled Content)
const isLoading = ref(true)
const isFadingOut = ref(false)
const isContentReady = ref(false)
const showEscapeHatch = ref(false)
const supportOpen = ref(false)
let escapeHatchTimer: ReturnType<typeof setTimeout> | null = null

const { applyUserPreferences } = useInitialUserPreferences()
const { resolveSessionReady } = useSessionReady()

// Show escape hatch after 10 seconds
onMounted(() => {
  escapeHatchTimer = setTimeout(() => {
    if (isLoading.value) {
      showEscapeHatch.value = true
    }
  }, 10000)
})

onUnmounted(() => {
  if (escapeHatchTimer)
    clearTimeout(escapeHatchTimer)
})

// Load content and then fade out loading screen
onMounted(async () => {
  if (import.meta.client) {
    // Block on user preferences so the correct theme and light/dark mode are
    // already applied before the loading screen lifts. This is a no-op for
    // guests - the composable guards against a null user internally.
    await applyUserPreferences()
    resolveSessionReady()

    // Mark content as ready first (render behind loading screen)
    setTimeout(() => {
      isContentReady.value = true

      // Then start the fade-out animation
      setTimeout(() => {
        isFadingOut.value = true

        // Remove the loading screen after animation completes
        setTimeout(() => {
          isLoading.value = false
          showEscapeHatch.value = false
        }, 500) // Match this to the transition duration in CSS
      }, 100) // Short delay to ensure content is rendered
    }, 100)
  }
})
</script>

<template>
  <!-- Loading overlay that fades out -->
  <Flex v-if="isLoading" class="initial-loading" :class="{ 'fade-out': isFadingOut }">
    <SharedLogo class="logo-animation" />
    <div class="pulse-bar" />
    <Transition name="escape-hatch">
      <Flex v-if="showEscapeHatch" column gap="s" x-center class="escape-hatch">
        <p class="escape-hatch__text">
          Taking longer than expected...
        </p>
        <Flex gap="xs" x-center>
          <Button variant="gray" size="s" @click="() => { isLoading = false }">
            Dismiss
          </Button>
          <Button variant="link" size="s" @click="supportOpen = true">
            Contact Support
          </Button>
        </Flex>
      </Flex>
    </Transition>
    <SharedSupportModal
      v-model:open="supportOpen"
      title="Loading issue?"
      message="If the app is stuck loading, there may be a temporary issue. Reach out and we'll help."
    />
  </Flex>
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

  transition:
    opacity 0.5s ease,
    background-color 0.5s ease;

  &.fade-out {
    opacity: 0;
  }

  .logo-animation {
    animation: fadeUp 0.4s ease-out;
  }

  .pulse-bar {
    position: fixed;
    top: 0px;
    width: 100%;
    height: 4px;
    border-radius: var(--border-radius-l);
    background: linear-gradient(
      90deg,
      transparent 0%,
      var(--color-accent) 40%,
      var(--color-text-lighter) 60%,
      transparent 100%
    );
    background-size: 200% 100%;
    animation: gradientPulse 3s ease-in-out infinite;
  }
}

// Force the full logo (icon + text) on the loading screen even on mobile.
.initial-loading {
  .logo--full {
    display: block !important;
  }

  .logo--compact {
    display: none !important;
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

@keyframes gradientPulse {
  0% {
    background-position: 200% 0;
    opacity: 0.4;
  }
  50% {
    background-position: 0% 0;
    opacity: 1;
  }
  100% {
    background-position: -200% 0;
    opacity: 0.4;
  }
}

.escape-hatch {
  position: fixed;
  bottom: var(--space-xl);
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;

  &__text {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
  }
}

.escape-hatch-enter-active {
  transition:
    opacity var(--transition-slow),
    transform var(--transition-slow);
}

.escape-hatch-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}
</style>
