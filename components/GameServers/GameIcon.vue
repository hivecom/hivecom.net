<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { getGameAssetUrl } from '~/utils/storage'

interface Props {
  game: Tables<'games'>
  size?: 'small' | 'medium' | 'large'
  showFallback?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 'medium',
  showFallback: true,
})

const supabase = useSupabaseClient()
const iconUrl = ref<string>('/icon.svg')
const isLoading = ref(true)
const hasError = ref(false)

// Size configurations
const sizeClasses = computed(() => {
  const sizes = {
    small: 'w-6 h-6', // 24px
    medium: 'w-8 h-8', // 32px
    large: 'w-12 h-12', // 48px
  }
  return sizes[props.size]
})

// Get game icon URL with fallback hierarchy
async function loadGameIcon() {
  try {
    isLoading.value = true
    hasError.value = false

    // First try: Custom icon from storage
    if (props.game.shorthand) {
      const customIconUrl = await getGameAssetUrl(supabase, props.game.shorthand, 'icon')
      if (customIconUrl) {
        iconUrl.value = customIconUrl
        return
      }
    }

    // Second try: Steam icon
    if (props.game.steam_id) {
      iconUrl.value = `https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/${props.game.steam_id}/icon.jpg`
      return
    }

    // Final fallback: Default icon
    iconUrl.value = '/icon.svg'
  }
  catch (error) {
    console.error(`Failed to load icon for game ${props.game.id}:`, error)
    hasError.value = true
    iconUrl.value = '/icon.svg'
  }
  finally {
    isLoading.value = false
  }
}

// Handle image load error by falling back to default
function handleImageError() {
  if (iconUrl.value !== '/icon.svg') {
    iconUrl.value = '/icon.svg'
    hasError.value = true
  }
}

// Load icon when component mounts or game changes
onMounted(() => {
  loadGameIcon()
})

watch(() => props.game, () => {
  loadGameIcon()
})
</script>

<template>
  <div class="game-icon-container" :class="sizeClasses">
    <!-- Loading skeleton -->
    <div v-if="isLoading" class="game-icon-skeleton" :class="sizeClasses" />

    <!-- Icon image -->
    <img
      v-else
      :src="iconUrl"
      :alt="`${game.name} icon`"
      class="game-icon"
      :class="{
        'fallback-icon': iconUrl === '/icon.svg' && showFallback,
        [sizeClasses]: true,
      }"
      @error="handleImageError"
    >
  </div>
</template>

<style lang="scss" scoped>
.game-icon-container {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.game-icon-skeleton {
  background: var(--color-background-secondary);
  border-radius: var(--border-radius-m);
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.game-icon {
  border-radius: var(--border-radius-m);
  background: var(--color-background-secondary);
  object-fit: cover;
  border: 1px solid var(--color-border);
  transition: opacity 0.2s ease;

  &.fallback-icon {
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

/* Utility classes for sizes */
.w-6 {
  width: 24px;
}
.h-6 {
  height: 24px;
}
.w-8 {
  width: 32px;
}
.h-8 {
  height: 32px;
}
.w-12 {
  width: 48px;
}
.h-12 {
  height: 48px;
}
</style>
