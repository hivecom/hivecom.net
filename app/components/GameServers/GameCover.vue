<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { useGameAssets } from '@/composables/useGameAssets'

interface Props {
  game: Tables<'games'>
  size?: 'small' | 'medium' | 'large' | 'xl'
  showFallback?: boolean
  aspectRatio?: 'card' | 'wide' | 'square'
}

const props = withDefaults(defineProps<Props>(), {
  size: 'medium',
  showFallback: true,
  aspectRatio: 'card',
})

const { getGameCoverUrl } = useGameAssets()

const coverUrl = ref<string | null>(null)
const isLoading = ref(true)
const hasError = ref(false)

// Size configurations
const sizeClasses = computed(() => {
  const sizes = {
    small: 'w-20 h-28', // 80x112px (card ratio)
    medium: 'w-32 h-44', // 128x176px (card ratio)
    large: 'w-40 h-56', // 160x224px (card ratio)
    xl: 'w-48 h-64', // 192x256px (card ratio)
  }

  const aspectRatios = {
    card: sizes[props.size],
    wide: props.size === 'small'
      ? 'w-28 h-16'
      : props.size === 'medium'
        ? 'w-44 h-24'
        : props.size === 'large' ? 'w-56 h-32' : 'w-64 h-36',
    square: props.size === 'small'
      ? 'w-20 h-20'
      : props.size === 'medium'
        ? 'w-32 h-32'
        : props.size === 'large' ? 'w-40 h-40' : 'w-48 h-48',
  }

  return aspectRatios[props.aspectRatio]
})

// Get game cover URL with fallback hierarchy and caching
async function loadGameCover() {
  try {
    isLoading.value = true
    hasError.value = false

    const url = await getGameCoverUrl(props.game)
    coverUrl.value = url
  }
  catch (error) {
    console.error(`Failed to load cover for game ${props.game.id}:`, error)
    hasError.value = true
    coverUrl.value = null
  }
  finally {
    isLoading.value = false
  }
}

// Handle image load error
function handleImageError() {
  hasError.value = true
  coverUrl.value = null
}

// Load cover when component mounts or game changes
onMounted(() => {
  loadGameCover()
})

watch(() => props.game, () => {
  loadGameCover()
})

// Expose function for external use
defineExpose({
  loadGameCover,
})
</script>

<template>
  <div class="game-cover-container" :class="sizeClasses">
    <!-- Loading skeleton -->
    <div v-if="isLoading" class="game-cover-skeleton" :class="sizeClasses" />

    <!-- Cover image -->
    <img
      v-else-if="coverUrl && !hasError"
      :src="coverUrl"
      :alt="`${game.name} cover`"
      class="game-cover"
      :class="sizeClasses"
      @error="handleImageError"
    >

    <!-- Fallback when no cover available -->
    <div
      v-else-if="showFallback"
      class="game-cover-fallback"
      :class="sizeClasses"
    >
      <span class="game-cover-fallback-text">{{ game.name }}</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.game-cover-container {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
}

.game-cover-skeleton {
  background: var(--color-background-secondary);
  border-radius: var(--border-radius-m);
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.game-cover {
  border-radius: var(--border-radius-m);
  background: var(--color-background-secondary);
  object-fit: cover;
  border: 1px solid var(--color-border);
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;

  &:hover {
    transform: scale(1.02);
  }
}

.game-cover-fallback {
  background: var(--color-background-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, var(--color-primary-100) 0%, var(--color-primary-200) 100%);
    opacity: 0.1;
  }
}

.game-cover-fallback-text {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-color-secondary);
  text-align: center;
  padding: 0.25rem;
  line-height: 1.2;
  word-break: break-word;
  z-index: 1;
  position: relative;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* Size utility classes */
.w-20 {
  width: 5rem;
}
.h-20 {
  height: 5rem;
}
.h-28 {
  height: 7rem;
}
.w-28 {
  width: 7rem;
}
.h-16 {
  height: 4rem;
}
.w-32 {
  width: 8rem;
}
.h-32 {
  height: 8rem;
}
.h-44 {
  height: 11rem;
}
.w-40 {
  width: 10rem;
}
.h-40 {
  height: 10rem;
}
.w-44 {
  width: 11rem;
}
.h-56 {
  height: 14rem;
}
.w-48 {
  width: 12rem;
}
.h-48 {
  height: 12rem;
}
.h-64 {
  height: 16rem;
}
.w-56 {
  width: 14rem;
}
.w-64 {
  width: 16rem;
}
.h-24 {
  height: 6rem;
}
.h-36 {
  height: 9rem;
}
</style>
