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

function handleImageError() {
  hasError.value = true
  coverUrl.value = null
}

onMounted(() => {
  loadGameCover()
})

watch(() => props.game, () => {
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
      class="game-cover"
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
  transition: opacity var(--transition);
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
