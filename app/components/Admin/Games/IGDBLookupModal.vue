<script setup lang="ts">
import type { IgdbGameDetails, IgdbSearchResult } from '@/composables/useIgdb'
import { Button, ButtonGroup, Flex, Input, Modal, Skeleton, Tooltip } from '@dolanske/vui'
import { ref, watch } from 'vue'
import { useIgdb } from '@/composables/useIgdb'

const props = defineProps<{
  /**
   * Pre-fill the search box with this name when the modal opens.
   * If steamId is also supplied the first query will be by steam_id.
   */
  initialName?: string
  steamId?: string
}>()

const emit = defineEmits<{
  (e: 'apply', payload: IgdbGameDetails): void
}>()

const isOpen = defineModel<boolean>('open')

const { searchByName, searchBySteamId, getDetails } = useIgdb()

const query = ref('')
const results = ref<IgdbSearchResult[]>([])
const searching = ref(false)
const applying = ref(false)
const searchError = ref<string | null>(null)
const selectedId = ref<number | null>(null)

// --- Search ---

async function runSearch() {
  const q = query.value.trim()
  if (!q)
    return
  searching.value = true
  searchError.value = null
  results.value = []
  try {
    results.value = await searchByName(q)
    if (!results.value.length)
      searchError.value = 'No results found.'
  }
  catch {
    searchError.value = 'Search failed. Please try again.'
  }
  finally {
    searching.value = false
  }
}

// When the modal opens, seed the query and run an initial lookup.
// If a steamId is provided try that first for an exact match, then fall back to name search.
watch(isOpen, async (open) => {
  if (!open) {
    query.value = ''
    results.value = []
    searchError.value = null
    selectedId.value = null
    applying.value = false
    return
  }

  query.value = props.initialName ?? ''

  if (props.steamId) {
    searching.value = true
    searchError.value = null
    try {
      const steamResults = await searchBySteamId(props.steamId)
      if (steamResults.length) {
        results.value = steamResults
        return
      }
    }
    catch { /* fall through to name search */ }
    finally {
      searching.value = false
    }
  }

  if (query.value)
    await runSearch()
})

// --- Apply ---

async function applyResult(result: IgdbSearchResult, overwrite: boolean) {
  selectedId.value = result.igdb_id
  applying.value = true
  try {
    const details = await getDetails(result.igdb_id)
    if (!details) {
      searchError.value = 'Could not load game details. Please try again.'
      return
    }
    emit('apply', { ...details, _overwrite: overwrite } as IgdbGameDetails & { _overwrite: boolean })
    isOpen.value = false
  }
  catch {
    searchError.value = 'Failed to load game details. Please try again.'
  }
  finally {
    applying.value = false
    selectedId.value = null
  }
}
</script>

<template>
  <Modal v-model:open="isOpen" size="m" @close="isOpen = false">
    <template #header>
      <Flex gap="xs" y-center expand>
        <Input
          v-model="query"
          expand
          placeholder="Search by game name..."
          @keydown.enter.prevent="runSearch"
        />
        <Button variant="accent" :loading="searching" :disabled="!query.trim()" @click="runSearch">
          Search
        </Button>
      </Flex>
    </template>

    <Flex column gap="m">
      <!-- Error -->
      <p v-if="searchError" class="text-s text-color-red">
        {{ searchError }}
      </p>

      <!-- Skeleton cards while searching -->
      <Flex v-if="searching" column expand gap="xs">
        <Flex v-for="i in 3" :key="i" expand class="igdb-modal__result igdb-modal__result--skeleton">
          <Skeleton width="48px" height="64px" :radius="4" />
          <Flex expand column gap="xs" class="igdb-modal__info">
            <Skeleton width="55%" height="14px" />
            <Skeleton width="80%" height="11px" />
            <Skeleton width="60%" height="11px" />
          </Flex>
        </Flex>
      </Flex>

      <!-- Results -->
      <Flex v-else-if="results.length" column gap="xs">
        <Flex
          v-for="result in results"
          :key="result.igdb_id"
          expand
          class="igdb-modal__result"
        >
          <!-- Cover thumb -->
          <div class="igdb-modal__cover">
            <img
              v-if="result.cover_url"
              :src="result.cover_url"
              :alt="result.name"
              class="igdb-modal__cover-img"
            >
            <div v-else class="igdb-modal__cover-placeholder">
              <Icon name="ph:game-controller" />
            </div>
          </div>

          <!-- Info -->
          <Flex column :gap="0" class="igdb-modal__info">
            <p class="text-s font-weight-medium">
              {{ result.name }}
              <span v-if="result.release_year" class="text-color-lighter">({{ result.release_year }})</span>
            </p>
            <p v-if="result.genre_names.length" class="text-xs text-color-light">
              {{ result.genre_names.slice(0, 4).join(', ') }}
            </p>
            <p v-if="result.summary" class="text-xs text-color-lighter igdb-modal__summary">
              {{ result.summary }}
            </p>
          </Flex>

          <!-- Action buttons -->
          <ButtonGroup class="igdb-modal__actions">
            <Tooltip>
              <Button
                variant="accent"
                size="s"
                square
                :loading="applying && selectedId === result.igdb_id"
                :disabled="applying"
                @click="applyResult(result, false)"
              >
                <Icon name="ph:plus" />
              </Button>
              <template #tooltip>
                <p>Fill empty</p>
              </template>
            </Tooltip>
            <Tooltip>
              <Button
                size="s"
                square
                :loading="applying && selectedId === result.igdb_id"
                :disabled="applying"
                @click="applyResult(result, true)"
              >
                <Icon name="ph:arrows-clockwise" />
              </Button>
              <template #tooltip>
                <p>Overwrite</p>
              </template>
            </Tooltip>
          </ButtonGroup>
        </Flex>
      </Flex>
    </Flex>
  </Modal>
</template>

<style scoped lang="scss">
.igdb-modal__result {
  display: flex;
  align-items: flex-start;
  gap: var(--space-s);
  padding: var(--space-s);
  border-radius: var(--border-radius-m);
  border: 1px solid var(--color-border);
  background: var(--color-bg-raised);
  transition: border-color var(--transition);

  &:hover:not(.igdb-modal__result--skeleton) {
    border-color: var(--color-border-strong);
  }
}

.igdb-modal__cover {
  flex-shrink: 0;
  width: 48px;
  height: 64px;
  border-radius: var(--border-radius-s);
  overflow: hidden;
}

.igdb-modal__cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.igdb-modal__cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-medium);
  color: var(--color-text-lighter);
  font-size: 1.5rem;
}

.igdb-modal__info {
  flex: 1;
  min-width: 0;
}

.igdb-modal__summary {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 2px;
}

.igdb-modal__actions {
  flex-shrink: 0;
  align-self: center;
}
</style>
