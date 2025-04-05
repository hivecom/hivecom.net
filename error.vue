<script setup lang="ts">
import { Button, Card, Divider } from '@dolanske/vui'
import { Icon } from '@iconify/vue'

import '~/assets/pages/error.scss'

// Error state setup
const error = useError()
const errorCode = computed(() => error.value?.statusCode || 404)
const errorMessage = computed(() => error.value?.message || 'Page not found')

const messages = {
  404: 'We couldn\'t find the page you\'re looking for.',
  500: 'Something went wrong on our end. We\'re working on it.',
  default: 'Oops! Something unexpected happened.',
}

const friendlyMessage = computed(() => {
  return messages[errorCode.value as keyof typeof messages] || messages.default
})

// Lightning effect setup
const isFlickering = ref(false)

// Create flickering effect at random intervals
onMounted(() => {
  if (import.meta.client) {
    const startFlickerEffect = () => {
      isFlickering.value = true
      setTimeout(() => {
        isFlickering.value = false

        // Schedule next flicker after a random delay
        const nextFlicker = Math.random() * 1000 + 3000 // Between 3-4 seconds
        setTimeout(startFlickerEffect, nextFlicker)
      }, Math.random() * 450 + 50) // Flicker lasts between 50-500ms
    }

    // Start the effect after a short delay
    setTimeout(startFlickerEffect, 1000)
  }
})
</script>

<template>
  <NuxtLayout name="error">
    <div class="error-container" :class="{ flicker: isFlickering }">
      <Card class="error-card">
        <div class="error-content">
          <div class="error-icon-wrapper" :class="{ flicker: isFlickering }">
            <Icon icon="ph:lightning-fill" class="error-icon" />
          </div>

          <h1 class="error-title">
            Error {{ errorCode }}
          </h1>
          <Divider />

          <p class="error-description">
            {{ friendlyMessage }}
          </p>
          <p class="error-message">
            {{ errorMessage }}
          </p>

          <div class="error-actions">
            <NuxtLink to="/">
              <Button class="error-button" size="l" variant="accent">
                <template #end>
                  <Icon icon="ph:arrow-u-up-left" />
                </template>
                Go whence you came
              </Button>
            </NuxtLink>
          </div>
        </div>
      </Card>
    </div>
  </NuxtLayout>

  <LayoutLoading />
</template>

<style lang="scss" scoped>
.error-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 90vh;
  padding: 2rem;
  position: relative;
}

.error-card {
  max-width: 800px; // Increased size
  width: 100%;
  text-align: center;
  padding: 3rem 2rem; // Added padding for more space
  position: relative;
  z-index: 10;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: -1;
    animation: pulse 6s infinite alternate;
    opacity: 0.05;
    background: var(--color-accent);
    border-radius: inherit;
  }
}

.error-icon-wrapper {
  display: flex;
  justify-content: center;
  margin-bottom: 1.5rem;

  &.flicker {
    animation: icon-flicker 0.1s ease-in-out;
  }
}

.error-icon {
  font-size: 5rem;
  color: var(--color-accent);
}

.error-content {
  position: relative;
  z-index: 10;
}

.error-title {
  font-size: 4rem;
  font-weight: bold;
  margin-bottom: 0.5rem;
  color: var(--vui-color-primary);
}

.error-description {
  font-size: 1.5rem;
  margin-bottom: 1rem;
  opacity: 0.9;
}

.error-message {
  font-size: 1rem;
  margin-bottom: 2rem;
  opacity: 0.7;
  font-style: italic;
}

.error-actions {
  display: flex;
  justify-content: center;
  margin-top: 2rem;
}

@keyframes pulse {
  0% {
    opacity: 0.03;
    transform: scale(1);
  }
  50% {
    opacity: 0.07;
    transform: scale(1.02);
  }
  100% {
    opacity: 0.03;
    transform: scale(1);
  }
}

@keyframes icon-flicker {
  0% {
    opacity: 1;
  }
  25% {
    opacity: 0.7;
  }
  50% {
    opacity: 1;
  }
  75% {
    opacity: 0.5;
  }
  100% {
    opacity: 1;
  }
}
</style>
