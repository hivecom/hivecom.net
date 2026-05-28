<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { useDataGameAssets } from '@/composables/useDataGameAssets'

interface Props {
  game: Tables<'games'>
  size?: 'xs' | 's' | 'm' | 'l' | 'xl'
  showFallback?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 'm',
  showFallback: true,
})

const { getGameIconUrl } = useDataGameAssets()

const iconUrl = ref<string>('/icon.svg')
const isLoading = ref(true)
const hasError = ref(false)
const isImageReady = ref(false)
const imgRef = ref<HTMLImageElement | null>(null)

async function loadGameIcon() {
  try {
    isLoading.value = true
    hasError.value = false

    const url = await getGameIconUrl(props.game)
    iconUrl.value = url || '/icon.svg'
  }
  catch (error) {
    console.error(`Failed to load icon for game ${props.game.id}:`, error)
    hasError.value = true
    iconUrl.value = '/icon.svg'
  }
  finally {
    isLoading.value = false
    isImageReady.value = false
    // Handle cached images: if the browser already has the asset, the @load
    // event may fire before Vue attaches the listener. Check `complete` after
    // the DOM updates and flip ready manually in that case.
    await nextTick()
    const el = imgRef.value
    if (el && el.complete && el.naturalWidth > 0)
      isImageReady.value = true
  }
}

function handleImageLoad() {
  isImageReady.value = true
}

function handleImageError() {
  if (iconUrl.value !== '/icon.svg') {
    iconUrl.value = '/icon.svg'
    hasError.value = true
  }
}

onMounted(() => {
  loadGameIcon()
})

watch(() => props.game, () => {
  loadGameIcon()
})
</script>

<template>
  <div class="game-icon-container" :data-size="size">
    <div v-if="isLoading" class="game-icon-skeleton" />
    <img
      v-else
      ref="imgRef"
      :src="iconUrl"
      :alt="`${game.name} icon`"
      class="game-icon"
      :class="{
        'game-icon--fallback': iconUrl === '/icon.svg' && showFallback,
        'game-icon--ready': isImageReady,
      }"
      @load="handleImageLoad"
      @error="handleImageError"
    >
  </div>
</template>

<style lang="scss" scoped>
.game-icon-container {
  --icon-size: 32px;

  &[data-size='xs'] {
    --icon-size: 16px;
  }

  &[data-size='s'] {
    --icon-size: 24px;
  }

  &[data-size='m'] {
    --icon-size: 32px;
  }

  &[data-size='l'] {
    --icon-size: 48px;
  }

  &[data-size='xl'] {
    --icon-size: 72px;
  }

  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--icon-size);
  height: var(--icon-size);
}

.game-icon-skeleton {
  width: var(--icon-size);
  height: var(--icon-size);
  background: var(--color-bg-raised);
  border-radius: var(--border-radius-m);
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.game-icon {
  width: var(--icon-size);
  height: var(--icon-size);
  border-radius: var(--border-radius-m);
  background: var(--color-bg-raised);
  object-fit: cover;
  opacity: 0;
  transition: opacity var(--transition-slow);

  &--ready {
    opacity: 1;
  }

  &--fallback {
    opacity: 0.3;
    filter: grayscale(1);
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
