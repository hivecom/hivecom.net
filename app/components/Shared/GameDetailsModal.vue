<script setup lang="ts">
import type { Database, Tables } from '@/types/database.types'
import { Alert, Button, Flex, Modal, Skeleton } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import GameIcon from '@/components/GameServers/GameIcon.vue'
import { useCacheGameAssets } from '@/composables/useCacheGameAssets'

interface Props {
  gameId?: number | null
  open?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  gameId: null,
})

const emit = defineEmits<{
  (e: 'close'): void
}>()

// Controlled modal visibility
const isOpen = defineModel<boolean>('open', { default: false })

const supabase = useSupabaseClient<Database>()
const { getGameCoverUrl, getGameBackgroundUrl } = useCacheGameAssets()

interface GameDetailsEntry {
  game: Tables<'games'>
  coverUrl: string | null
  backgroundUrl: string | null
}

const currentDetails = ref<GameDetailsEntry | null>(null)
const loading = ref(false)
const error = ref('')
const detailsCache = new Map<number, GameDetailsEntry>()
let fetchToken = 0

const isModalVisible = computed(() => Boolean(props.gameId) && isOpen.value)
const gameName = computed(() => currentDetails.value?.game.name ?? 'Game Details')
const heroImageUrl = computed(() => currentDetails.value?.backgroundUrl ?? currentDetails.value?.coverUrl ?? null)
const steamUrl = computed(() => {
  const steamId = currentDetails.value?.game.steam_id
  return steamId ? `https://store.steampowered.com/app/${steamId}` : null
})
const websiteUrl = computed(() => {
  const raw = currentDetails.value?.game.website?.trim()
  return raw || null
})

async function loadGameDetails(gameId: number) {
  // Serve from cache if available
  if (detailsCache.has(gameId)) {
    currentDetails.value = detailsCache.get(gameId) || null
    loading.value = false
    error.value = ''
    return
  }

  loading.value = true
  error.value = ''
  const currentFetchToken = ++fetchToken

  try {
    const { data, error: fetchError } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .maybeSingle()

    if (currentFetchToken !== fetchToken)
      return

    if (fetchError)
      throw fetchError

    if (!data) {
      currentDetails.value = null
      error.value = 'Game not found.'
      return
    }

    const [coverUrl, backgroundUrl] = await Promise.all([
      getGameCoverUrl(data),
      getGameBackgroundUrl(data),
    ])

    const entry: GameDetailsEntry = {
      game: data,
      coverUrl,
      backgroundUrl,
    }

    detailsCache.set(gameId, entry)
    currentDetails.value = entry
  }
  catch (err) {
    console.error('Failed to load game details:', err)
    if (currentFetchToken === fetchToken) {
      error.value = err instanceof Error ? err.message : 'Unable to load game details.'
      currentDetails.value = null
    }
  }
  finally {
    if (currentFetchToken === fetchToken)
      loading.value = false
  }
}

function handleClose() {
  isOpen.value = false
  emit('close')
}

// Prime cache data when props change and lazily fetch when modal opens
watch(
  [() => props.gameId, () => isOpen.value],
  ([gameId, open]) => {
    if (!gameId) {
      currentDetails.value = null
      error.value = ''
      loading.value = false
      return
    }

    if (detailsCache.has(gameId))
      currentDetails.value = detailsCache.get(gameId) || null

    if (open)
      loadGameDetails(gameId)
  },
  { immediate: true },
)
</script>

<template>
  <Modal :open="isModalVisible" centered @close="handleClose">
    <template #header>
      <Flex gap="m" y-center>
        <GameIcon v-if="currentDetails?.game" :game="currentDetails.game" size="medium" />
        <h3 class="game-details-modal__title">
          {{ gameName }}
        </h3>
      </Flex>
    </template>

    <div class="game-details-modal">
      <!-- Loading State -->
      <div v-if="loading" class="game-details-modal__loading">
        <Skeleton height="160px" width="100%" />
        <Skeleton height="20px" width="60%" />
        <Skeleton height="16px" width="40%" />
      </div>

      <!-- Error State -->
      <Alert v-else-if="error" variant="danger">
        {{ error }}
      </Alert>

      <!-- Content -->
      <div v-else-if="currentDetails" class="game-details-modal__content">
        <div class="game-details-modal__media" :class="{ 'game-details-modal__media--empty': !heroImageUrl }">
          <img
            v-if="heroImageUrl"
            :src="heroImageUrl"
            :alt="`${gameName} artwork`"
            loading="lazy"
          >
          <div v-else class="game-details-modal__media-placeholder">
            <Icon name="ph:image" size="32" />
            <span>No artwork available (yet)</span>
          </div>
        </div>
      </div>

      <div v-else class="game-details-modal__empty">
        <Flex column gap="s" y-center>
          <Icon name="ph:warning" size="32" />
          <span>No game selected.</span>
        </Flex>
      </div>
    </div>

    <template #footer>
      <Flex gap="s" x-end>
        <NuxtLink
          v-if="websiteUrl"
          :to="websiteUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button>
            <template #start>
              <Icon name="ph:globe" />
            </template>
            Visit Website
          </Button>
        </NuxtLink>
        <NuxtLink
          v-if="steamUrl"
          :to="steamUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="accent">
            <template #start>
              <Icon name="ph:steam-logo" />
            </template>
            View on Steam
          </Button>
        </NuxtLink>
        <Button variant="gray" @click="handleClose">
          Close
        </Button>
      </Flex>
    </template>
  </Modal>
</template>

<style scoped lang="scss">
.game-details-modal {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);

  &__loading {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
  }

  &__content {
    display: flex;
    flex-direction: column;
    gap: var(--space-m);
  }

  &__media {
    position: relative;
    border-radius: var(--border-radius-l);
    overflow: hidden;
    border: 1px solid var(--color-border);
    background: var(--color-bg-muted);

    img {
      width: 100%;
      height: 200px;
      object-fit: cover;
      display: block;
    }

    &--empty {
      border-style: dashed;
    }
  }

  &__media-placeholder {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    align-items: center;
    justify-content: center;
    height: 200px;
    color: var(--color-text-light);
    font-size: var(--font-size-s);
  }

  &__subtitle {
    margin: 0;
    font-size: var(--font-size-s);
    color: var(--color-text-light);
  }

  &__title {
    margin: 0;
  }

  &__empty {
    padding: var(--space-l);
    border-radius: var(--border-radius-m);
    border: 1px dashed var(--color-border);
    text-align: center;
    color: var(--color-text-light);
  }
}
</style>
