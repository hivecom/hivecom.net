<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { useDataGameAssets } from '@/composables/useDataGameAssets'

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

const { getGameCoverUrl } = useDataGameAssets()

const coverUrl = ref<string | null>(null)
const isLoading = ref(true)
const hasError = ref(false)
const isImageReady = ref(false)

// Incremented per load so an older in-flight lookup can't clobber the state
// of a newer one (it used to reset isImageReady after the image had loaded).
let loadToken = 0

async function loadGameCover() {
  const token = ++loadToken
  isLoading.value = true
  hasError.value = false

  let url: string | null = null
  try {
    url = await getGameCoverUrl(props.game)
  }
  catch (error) {
    console.error(`Failed to load cover for game ${props.game.id}:`, error)
    if (token === loadToken)
      hasError.value = true
  }

  if (token !== loadToken)
    return

  // Same URL means the <img> stays mounted and won't fire load again, so
  // keep the ready state we already have.
  if (url !== coverUrl.value)
    isImageReady.value = false
  coverUrl.value = url
  isLoading.value = false
}

function handleImageLoad() {
  isImageReady.value = true
}

function handleImageError() {
  hasError.value = true
  coverUrl.value = null
}

onMounted(() => {
  loadGameCover()
})

// Watch identity rather than the object: list refetches hand us fresh
// references for the same game and shouldn't restart the lookup.
watch(() => [props.game.id, props.game.shorthand], () => {
  loadGameCover()
})

defineExpose({
  loadGameCover,
})
</script>

<template>
  <div class="game-cover-container" :data-size="size" :data-ratio="aspectRatio">
    <div v-if="isLoading" class="game-cover-skeleton" />

    <img
      v-else-if="coverUrl && !hasError"
      :src="coverUrl"
      :alt="`${game.name} cover`"
      draggable="false"
      class="game-cover"
      :class="{ 'game-cover--ready': isImageReady }"
      @load="handleImageLoad"
      @error="handleImageError"
    >

    <div v-else-if="showFallback" class="game-cover-fallback">
      <span class="game-cover-fallback__text">{{ game.name }}</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// Base widths per size
// card ratio = 2:3 (width * 1.5 = height)
// wide ratio = 16:9
// square ratio = 1:1

.game-cover-container {
  --cover-width: 8rem;
  --cover-height: 12rem;

  &[data-size='small'] {
    --cover-width: 5rem;
  }

  &[data-size='medium'] {
    --cover-width: 8rem;
  }

  &[data-size='large'] {
    --cover-width: 10rem;
  }

  &[data-size='xl'] {
    --cover-width: 12rem;
  }

  &[data-ratio='card'] {
    --cover-height: calc(var(--cover-width) * 1.5);
  }

  &[data-ratio='wide'] {
    --cover-height: calc(var(--cover-width) * 0.5625);
  }

  &[data-ratio='square'] {
    --cover-height: var(--cover-width);
  }

  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
  width: var(--cover-width);
  height: var(--cover-height);
}

.game-cover-skeleton {
  width: var(--cover-width);
  height: var(--cover-height);
  background: var(--color-bg-raised);
  border-radius: var(--border-radius-m);
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.game-cover {
  border: 1px solid var(--color-border);
  width: var(--cover-width);
  height: var(--cover-height);
  border-radius: var(--border-radius-m);
  background: var(--color-bg-raised);
  object-fit: cover;
  border: 1px solid var(--color-border);
  opacity: 0;
  transition: opacity var(--transition-slow);

  &--ready {
    opacity: 1;
  }
}

.game-cover-fallback {
  width: var(--cover-width);
  height: var(--cover-height);
  background: var(--color-bg-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;

  &__text {
    font-size: var(--font-size-xxs);
    font-weight: 600;
    color: var(--color-text-light);
    text-align: center;
    padding: var(--space-xxs);
    line-height: 1.2;
    word-break: break-word;
    position: relative;
    z-index: 1;
  }
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
</style>
