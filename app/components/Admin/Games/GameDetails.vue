<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Badge, Card, Flex, Sheet, Skeleton } from '@dolanske/vui'
import { defineAsyncComponent, ref, watchEffect } from 'vue'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import DetailRow from '@/components/Admin/Shared/DetailRow.vue'
import DetailTable from '@/components/Admin/Shared/DetailTable.vue'
import ChartActivityHistogramControls from '@/components/Shared/Charts/ChartActivityHistogramControls.vue'
import CopyValue from '@/components/Shared/CopyValue.vue'
import MarkdownRenderer from '@/components/Shared/MarkdownRenderer.vue'
import Metadata from '@/components/Shared/Metadata.vue'
import SteamLink from '@/components/Shared/SteamLink.vue'

const props = defineProps<{
  game: Tables<'games'> | null
}>()

// Define emits
const emit = defineEmits<{
  edit: [item: Tables<'games'>]
  delete: [item: Tables<'games'>]
}>()

const ChartGameActivity = defineAsyncComponent(() => import('@/components/Shared/Charts/ChartGameActivity.vue'))

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// Handle closing the sheet
function handleClose() {
  isOpen.value = false
}

// Handle edit action from AdminActions
function handleEdit(item: Record<string, unknown>) {
  emit('edit', item as Tables<'games'>)
  isOpen.value = false
}

// Handle delete action from AdminActions
function handleDelete(item: Record<string, unknown>) {
  emit('delete', item as Tables<'games'>)
  isOpen.value = false
}

// Gameservers data fetching
const supabase = useSupabaseClient()
const gameserversLoading = ref(false)
const gameserversError = ref('')

// Game assets composable
const { getGameIconUrl, getGameCoverUrl, getGameBackgroundUrl } = useDataGameAssets()

interface GameServerWithContainer {
  id: number
  name: string
  description: string | null
  region: 'eu' | 'na' | 'all' | null
  addresses: string[] | null
  port: string | null
  created_at: string
  container: {
    name: string
    running: boolean
    healthy: boolean | null
  } | null
}

const gameservers = ref<GameServerWithContainer[]>([])

// Game assets state
const assetsLoading = ref(false)
const assetsUrl = ref({
  icon: null as string | null,
  cover: null as string | null,
  background: null as string | null,
})

// Fetch gameservers and assets when game changes
watchEffect(async () => {
  if (!props.game?.id) {
    gameservers.value = []
    assetsUrl.value = {
      icon: null,
      cover: null,
      background: null,
    }
    return
  }

  // Load gameservers
  gameserversLoading.value = true
  gameserversError.value = ''

  // Load assets if shorthand exists
  if (props.game.shorthand) {
    assetsLoading.value = true

    // Load all assets in parallel using the composable
    const [iconUrl, coverUrl, backgroundUrl] = await Promise.all([
      getGameIconUrl(props.game),
      getGameCoverUrl(props.game),
      getGameBackgroundUrl(props.game),
    ])

    assetsUrl.value = {
      icon: iconUrl,
      cover: coverUrl,
      background: backgroundUrl,
    }

    assetsLoading.value = false
  }
  else {
    assetsUrl.value = {
      icon: null,
      cover: null,
      background: null,
    }
  }

  try {
    // Create a fresh query each time to avoid caching issues
    const { data, error } = await supabase
      .from('network_gameservers')
      .select(`
        id,
        name,
        description,
        region,
        addresses,
        port,
        created_at,
        container!left (
          name,
          running,
          healthy
        )
      `)
      .eq('game', props.game.id)

    if (error) {
      throw error
    }

    gameservers.value = (data as GameServerWithContainer[]) || []
  }
  catch (error: unknown) {
    gameserversError.value = error instanceof Error ? error.message : 'Failed to load gameservers'
  }
  finally {
    gameserversLoading.value = false
  }
})
</script>

<template>
  <Sheet
    :open="!!props.game && isOpen"
    position="right"
    :card="{ separators: true }"
    :size="600"
    @close="handleClose"
  >
    <template #header>
      <Flex x-between y-center class="pr-s">
        <Flex column :gap="0">
          <h4>Game Details</h4>
          <p v-if="props.game" class="text-color-light text-xs">
            {{ props.game.name }}
          </p>
        </Flex>
        <Flex y-center gap="s">
          <AdminActions
            v-if="props.game"
            resource-type="games"
            :item="props.game"
            :show-labels="true"
            @edit="handleEdit"
            @delete="handleDelete"
          />
        </Flex>
      </Flex>
    </template>

    <Flex v-if="props.game" column gap="m" expand class="game-details">
      <!-- Basic info -->
      <DetailTable>
        <template #header>
          <Icon name="ph:game-controller" />
          <h6>Overview</h6>
        </template>

        <DetailRow label="ID">
          <CopyValue :text="String(props.game.id)" link />
        </DetailRow>

        <DetailRow label="Name">
          <span class="text-s">{{ props.game.name }}</span>
        </DetailRow>

        <DetailRow label="Shorthand" :hidden="!props.game.shorthand">
          <code>{{ props.game.shorthand }}</code>
        </DetailRow>

        <DetailRow label="Steam ID" :hidden="!props.game.steam_id">
          <SteamLink v-if="props.game.steam_id" :steam-id="props.game.steam_id" show-icon />
        </DetailRow>

        <DetailRow label="Website" :hidden="!props.game.website">
          <NuxtLink
            v-if="props.game.website"
            :to="props.game.website"
            class="game-details__link"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ props.game.website }}
          </NuxtLink>
        </DetailRow>

        <DetailRow label="Release Date" :hidden="!props.game.release_date">
          <span class="text-s">{{ props.game.release_date ? new Date(props.game.release_date).getFullYear() : '' }}</span>
        </DetailRow>

        <DetailRow label="Description / Tagline" :hidden="!props.game.description">
          <span class="text-s">{{ props.game.description }}</span>
        </DetailRow>

        <DetailRow label="Genres" :hidden="!props.game.genre_tags || props.game.genre_tags.length === 0">
          <Flex gap="xs" wrap>
            <Badge v-for="tag in props.game.genre_tags" :key="tag" variant="neutral" size="s">
              {{ tag }}
            </Badge>
          </Flex>
        </DetailRow>

        <DetailRow label="Multiplayer" :hidden="!props.game.multiplayer_modes || props.game.multiplayer_modes.length === 0">
          <Flex gap="xs" wrap>
            <Badge v-for="mode in props.game.multiplayer_modes" :key="mode" variant="neutral" size="s">
              {{ mode }}
            </Badge>
          </Flex>
        </DetailRow>

        <DetailRow label="Accent Color" :hidden="!props.game.color">
          <Flex y-center gap="s">
            <div
              class="game-details__color-swatch"
              :style="{ backgroundColor: props.game.color ?? undefined }"
            />
            <span class="text-s">{{ props.game.color }}</span>
          </Flex>
        </DetailRow>

        <DetailRow label="Forum Topic" :hidden="!props.game.discussion_topic_id">
          <NuxtLink
            v-if="props.game.discussion_topic_id"
            :to="`/forum?activeTopicId=${encodeURIComponent(props.game.discussion_topic_id)}`"
            class="game-details__link"
          >
            {{ props.game.discussion_topic_id }}
          </NuxtLink>
        </DetailRow>
      </DetailTable>

      <!-- Content (Markdown) -->
      <Card v-if="props.game.markdown" separators class="card-bg" expand>
        <template #header>
          <Flex x-between y-center expand>
            <Flex y-center gap="xs">
              <Icon name="ph:article" />
              <h6>Content</h6>
            </Flex>
            <span class="text-color-lightest text-xs">Markdown</span>
          </Flex>
        </template>
        <MarkdownRenderer :md="props.game.markdown" />
      </Card>

      <!-- Related Game Servers -->
      <Card separators class="card-bg" expand>
        <template #header>
          <Flex y-center gap="xs">
            <Icon name="ph:hard-drives" />
            <h6>Game Servers</h6>
          </Flex>
        </template>

        <!-- Loading state -->
        <Flex v-if="gameserversLoading" column gap="s" expand>
          <Flex v-for="i in 3" :key="i" class="game-details__gameserver-item" expand>
            <Flex y-center x-between gap="m" expand>
              <Skeleton :width="120" :height="16" :radius="4" />
              <Skeleton :width="80" :height="20" :radius="8" />
            </Flex>
          </Flex>
        </Flex>

        <!-- Error state -->
        <div v-else-if="gameserversError" class="game-details__placeholder-text game-details__placeholder-text--error">
          Error: {{ gameserversError }}
        </div>

        <!-- No gameservers -->
        <div v-else-if="gameservers.length === 0" class="game-details__placeholder-text">
          No gameservers associated with this game.
        </div>

        <!-- Gameservers list -->
        <Flex v-else column gap="s" expand>
          <Flex v-for="gameserver in gameservers" :key="gameserver.id" class="game-details__gameserver-item" expand>
            <Flex y-center x-between gap="m" expand>
              <NuxtLink
                :to="`/admin/network?tab=Gameservers&gameserver=${gameserver.id}`"
                class="game-details__gameserver-name"
              >
                {{ gameserver.name }}
              </NuxtLink>

              <!-- Addresses -->
              <Flex v-if="gameserver.addresses && gameserver.addresses.length > 0" y-center gap="xs">
                <span v-for="address in gameserver.addresses.slice(0, 1)" :key="address" class="game-details__gameserver-address">
                  {{ address }}{{ gameserver.port ? `:${gameserver.port}` : '' }}
                </span>
                <span v-if="gameserver.addresses.length > 1" class="game-details__address-count">
                  +{{ gameserver.addresses.length - 1 }} more
                </span>
              </Flex>
            </Flex>
          </Flex>
        </Flex>
      </Card>

      <!-- Activity -->
      <Card separators class="card-bg" expand>
        <template #header>
          <Flex y-center gap="xs">
            <Icon name="ph:chart-bar" />
            <h6>Activity</h6>
          </Flex>
        </template>
        <ChartActivityHistogramControls :series="['usersGameActivity']" :game-id="props.game.id">
          <template #default="{ period, window, utc, color }">
            <ChartGameActivity :period :window :utc :color="props.game.color ?? color" :game-id="props.game.id" compact />
          </template>
        </ChartActivityHistogramControls>
      </Card>

      <!-- Game Assets -->
      <Card v-if="props.game.shorthand" separators class="card-bg">
        <template #header>
          <Flex y-center gap="xs">
            <Icon name="ph:image" />
            <h6>Game Assets</h6>
          </Flex>
        </template>

        <!-- Loading state -->
        <Flex v-if="assetsLoading" column gap="m" expand>
          <!-- Game Icon Skeleton -->
          <Flex column gap="s" expand>
            <Skeleton :width="32" :height="14" :radius="4" />
            <Skeleton :width="64" :height="64" :radius="8" />
          </Flex>

          <!-- Game Cover Skeleton -->
          <Flex column gap="s" expand>
            <Skeleton :width="40" :height="14" :radius="4" />
            <Skeleton :width="133" :height="200" :radius="8" />
          </Flex>

          <!-- Game Background Skeleton -->
          <Flex column gap="s" expand>
            <Skeleton :width="70" :height="14" :radius="4" />
            <Skeleton :height="108" :radius="8" />
          </Flex>
        </Flex>

        <!-- Assets display -->
        <Flex v-else column gap="m" expand>
          <!-- Game Icon -->
          <Flex column gap="s" expand>
            <span class="game-details__asset-label">Icon</span>
            <Flex v-if="assetsUrl.icon" y-center>
              <img
                :src="assetsUrl.icon"
                alt="Game Icon"
                class="game-details__asset-image game-details__asset-image--icon"
              >
            </Flex>
            <span v-else class="game-details__asset-missing">No icon uploaded</span>
          </Flex>

          <!-- Game Cover -->
          <Flex column gap="s" expand>
            <span class="game-details__asset-label">Cover</span>
            <Flex v-if="assetsUrl.cover" y-center expand>
              <img
                :src="assetsUrl.cover"
                alt="Game Cover"
                class="game-details__asset-image game-details__asset-image--cover"
              >
            </Flex>
            <span v-else class="game-details__asset-missing">No cover uploaded</span>
          </Flex>

          <!-- Game Background -->
          <Flex column gap="s" expand>
            <span class="game-details__asset-label">Background</span>
            <Flex v-if="assetsUrl.background" y-center>
              <img
                :src="assetsUrl.background"
                alt="Game Background"
                class="game-details__asset-image game-details__asset-image--background"
              >
            </Flex>
            <span v-else class="game-details__asset-missing">No background uploaded</span>
          </Flex>
        </Flex>
      </Card>

      <!-- No shorthand notice -->
      <Card v-else-if="props.game" class="card-bg">
        <Flex y-center gap="s" class="game-details__placeholder-text">
          <Icon name="ph:info" />
          <span>Game assets are not available because this game has no shorthand assigned.</span>
        </Flex>
      </Card>

      <!-- Metadata -->
      <Metadata
        :created-at="props.game.created_at"
        :created-by="props.game.created_by"
        :modified-at="props.game.modified_at"
        :modified-by="props.game.modified_by"
      />
    </Flex>
  </Sheet>
</template>

<style lang="scss" scoped>
.game-details {
  padding-bottom: var(--space);

  &__link {
    color: var(--color-accent);
    word-break: break-all;
    font-size: var(--font-size-s);
  }

  &__color-swatch {
    width: 20px;
    height: 20px;
    border-radius: var(--border-radius-s);
    border: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  &__metadata-by {
    font-size: var(--font-size-l);
    color: var(--color-text-light);
  }

  &__placeholder-text {
    color: var(--color-text-lighter);
    font-size: var(--font-size-s);

    &--error {
      color: var(--color-text-red);
    }
  }

  &__gameserver-item {
    width: 100%;
    padding: var(--space-s);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-s);
    background-color: var(--color-bg);
  }

  &__gameserver-name {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    color: var(--color-text);
  }

  &__gameserver-description {
    font-size: var(--font-size-s);
    color: var(--color-text-light);
    margin: 0;
  }

  &__gameserver-address {
    font-family: monospace;
    font-size: var(--font-size-xs);
    color: var(--color-text-light);
    background-color: var(--color-bg-raised);
    padding: var(--space-xs) var(--space-s);
    border-radius: var(--border-radius-s);
  }

  &__address-count {
    font-size: var(--font-size-s);
    color: var(--color-text-light);
  }

  &__asset-label {
    font-size: var(--font-size-s);
    font-weight: var(--font-weight-medium);
    color: var(--color-text);
  }

  &__asset-image {
    width: 100%;
    border-radius: var(--border-radius-s);
    border: 1px solid var(--color-border);
    background-color: var(--color-bg-subtle);
    object-fit: cover;

    &--icon {
      width: 64px;
      height: 64px;
    }

    &--cover {
      aspect-ratio: 600 / 900;
      max-width: 200px;
    }
  }

  &__asset-missing {
    font-size: var(--font-size-s);
    color: var(--color-text-light);
    font-style: italic;
  }

  &__status-indicator {
    width: 8px;
    height: 8px;
    border-radius: var(--border-radius-pill);
    flex-shrink: 0;

    &--healthy {
      background-color: var(--color-text-green);
    }

    &--unhealthy {
      background-color: var(--color-text-orange);
    }

    &--offline {
      background-color: var(--color-text-red);
    }

    &--unknown {
      background-color: var(--color-text-light);
    }
  }
}
</style>
