<script setup lang="ts">
import type { Database } from '@/types/database.types'
import { Button, Card, Flex, Grid, Input, paginate, Pagination, Select, Skeleton, Tab, Tabs, Tooltip } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'
import { DEFAULT_THEME } from '@/lib/theme'
import ThemeCard from './ThemeCard.vue'

type ThemeRow = Database['public']['Tables']['themes']['Row']
interface GalleryTheme extends ThemeRow { user_count: number | null, fork_count: number | null }

const emit = defineEmits<{
  create: []
  edit: [theme: ThemeRow]
}>()

const supabase = useSupabaseClient<Database>()
const userId = useUserId()

const { activeTheme, setActiveTheme } = useUserTheme()
const { softDelete, hardDelete } = useDataThemes()

type GalleryTab = 'official' | 'community' | 'created'

const route = useRoute()
const router = useRouter()

// Active tab + URL sync
const activeTab = computed<GalleryTab>({
  get() {
    const t = route.query.tab
    if (t === 'community' || t === 'created')
      return t
    return 'official'
  },
  set(value) {
    router.replace({ query: { ...route.query, tab: value } })
  },
})

const search = ref('')
const currentPage = ref(1)
const PER_PAGE = 8

const items = ref<GalleryTheme[]>([])
const totalCount = ref(0)
const loading = ref(false)
const error = ref<string | null>(null)

// Community tab filters
const showForks = ref(false)

type SortValue = 'newest' | 'popular' | 'forks'
const communitySort = ref<SortValue>('newest')

interface SortOption { label: string, value: SortValue }
const sortOptions: SortOption[] = [
  { label: 'Newest', value: 'newest' },
  { label: 'Most popular', value: 'popular' },
  { label: 'Most forked', value: 'forks' },
]

const selectedSort = computed({
  get(): SortOption[] {
    return [sortOptions.find(o => o.value === communitySort.value) ?? sortOptions[0]!]
  },
  set(options: SortOption[]) {
    if (options[0])
      communitySort.value = options[0].value
  },
})

async function fetchPage(tab: GalleryTab, page: number, searchValue: string) {
  loading.value = true
  error.value = null
  items.value = []

  const from = (page - 1) * PER_PAGE
  const to = from + PER_PAGE - 1

  try {
    let query = supabase
      .from('themes')
      .select('*, theme_usage!profiles_theme_id_fkey(user_count)', { count: 'exact' })

    if (searchValue.trim()) {
      query = query.or(`name.ilike.%${searchValue}%,description.ilike.%${searchValue}%`)
    }

    switch (tab) {
      case 'official':
        query = query.eq('is_official', true)
        break
      case 'community':
        query = query.eq('is_official', false).not('created_by', 'is', null)
        if (!showForks.value) {
          query = query.is('forked_from', null)
        }
        break
      case 'created':
        if (!userId.value) {
          items.value = []
          totalCount.value = 0
          loading.value = false
          return
        }
        query = query.eq('created_by', userId.value)
        break
    }

    // For official tab, keep unmaintained hidden unless it's the user's currently active theme.
    // For community and created tabs, always show unmaintained but sort them last.
    if (tab === 'official') {
      const activeId = activeTheme.value?.id
      if (activeId) {
        query = query.or(`is_unmaintained.eq.false,id.eq.${activeId}`)
      }
      else {
        query = query.eq('is_unmaintained', false)
      }
      query = query.order('created_at', { ascending: false })
    }
    else {
      // For community, server-side sort by is_unmaintained + created_at;
      // popular/forks sorting is applied client-side after user_count/fork_count are mapped.
      query = query.order('is_unmaintained', { ascending: true }).order('created_at', { ascending: false })
    }

    query = query.range(from, to)

    const { data, count, error: fetchError } = await query

    if (fetchError)
      throw fetchError

    const rawData = (data ?? [])

    // Count forks via a secondary query (self-referential joins are unsupported in PostgREST)
    const pageIds = rawData.map(t => t.id)
    const forkCounts: Record<string, number> = {}
    if (pageIds.length > 0) {
      const { data: forkRows } = await supabase
        .from('themes')
        .select('forked_from')
        .in('forked_from', pageIds)
        .not('forked_from', 'is', null)
      for (const row of forkRows ?? []) {
        if (row.forked_from)
          forkCounts[row.forked_from] = (forkCounts[row.forked_from] ?? 0) + 1
      }
    }

    const mapped: GalleryTheme[] = rawData.map(({ theme_usage, ...row }) => ({
      ...row,
      user_count: theme_usage?.[0]?.user_count ?? null,
      fork_count: forkCounts[row.id] ?? null,
    }))

    // Client-side sort for community tab popular/forks options
    // (user_count and fork_count are not available server-side for ordering)
    if (tab === 'community') {
      if (communitySort.value === 'popular') {
        mapped.sort((a, b) => (b.user_count ?? -1) - (a.user_count ?? -1))
      }
      else if (communitySort.value === 'forks') {
        mapped.sort((a, b) => (b.fork_count ?? -1) - (a.fork_count ?? -1))
      }
    }

    items.value = mapped
    totalCount.value = count ?? 0
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to fetch themes'
    items.value = []
    totalCount.value = 0
  }
  finally {
    loading.value = false
  }
}

const defaultCardMatchesSearch = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q)
    return true
  return 'default theme'.includes(q) || 'the tried and tested default skin/theme of hivecom'.includes(q)
})

const pagination = computed(() =>
  paginate(totalCount.value, currentPage.value, PER_PAGE),
)

// Reset page and re-fetch when tab changes; also reset community-specific filters
watch(activeTab, () => {
  currentPage.value = 1
  search.value = ''
  showForks.value = false
  communitySort.value = 'newest'
  void fetchPage(activeTab.value, 1, '')
})

watch(search, () => {
  currentPage.value = 1
  void fetchPage(activeTab.value, 1, search.value)
})

watch(showForks, () => {
  currentPage.value = 1
  void fetchPage(activeTab.value, 1, search.value)
})

watch(communitySort, () => {
  currentPage.value = 1
  void fetchPage(activeTab.value, 1, search.value)
})

function onPageChange(page: number) {
  currentPage.value = page
  void fetchPage(activeTab.value, page, search.value)
}

function deprecateTheme(id: string) {
  if (activeTheme.value?.id === id) {
    setActiveTheme(null)
  }

  void softDelete(id).then(() => {
    void fetchPage(activeTab.value, currentPage.value, search.value)
  })
}

function deleteTheme(id: string) {
  if (activeTheme.value?.id === id) {
    setActiveTheme(null)
  }

  void hardDelete(id).then(() => {
    void fetchPage(activeTab.value, currentPage.value, search.value)
  })
}

// Initial load
onMounted(() => {
  void fetchPage(activeTab.value, currentPage.value, search.value)
})

// On the official tab, unmaintained themes are hidden unless they are the active theme.
// Re-fetch when the active theme changes to an unmaintained one or away from one.
watch(() => activeTheme.value?.id, (newId, oldId) => {
  if (activeTab.value !== 'official')
    return
  const affectsVisibility
    = items.value.some(t => t.id === newId && t.is_unmaintained)
      || items.value.some(t => t.id === oldId && t.is_unmaintained)
  if (affectsVisibility)
    void fetchPage(activeTab.value, currentPage.value, search.value)
})

const isMobile = useBreakpoint('<s')

// Expose refresh so ThemeEditor can trigger a re-fetch after writes
function refresh() {
  void fetchPage(activeTab.value, currentPage.value, search.value)
}

function switchToCreated() {
  activeTab.value = 'created'
  currentPage.value = 1
  void fetchPage('created', 1, search.value)
}

defineExpose({ refresh, switchToCreated })
</script>

<template>
  <section>
    <Tabs v-model="activeTab" class="mb-m">
      <Tab value="official">
        Official
      </Tab>
      <Tab value="community">
        Community
      </Tab>
      <Tab v-show="userId" value="created">
        My themes
      </Tab>

      <template #end>
        <Button variant="accent" :square="isMobile" size="s" @click="emit('create')">
          <Icon v-if="isMobile" name="ph:plus" :size="16" />
          <template #start>
            <Icon v-if="!isMobile" name="ph:plus" :size="16" />
          </template>
          {{ isMobile ? '' : 'Create' }}
        </Button>
      </template>
    </Tabs>

    <Flex x-between y-center gap="s" :wrap="isMobile" class="mb-s">
      <Input v-model="search" placeholder="Search themes..." class="search-input" :expand="isMobile" />
      <Flex v-if="activeTab === 'community'" y-center gap="s" :expand="isMobile">
        <Select
          v-model="selectedSort"
          :options="sortOptions"
          label-key="label"
          :show-clear="false"
          :expand="isMobile"
        />
        <Tooltip>
          <Button
            :variant="showForks ? 'fill' : 'gray'"
            :outline="!showForks"
            @click="showForks = !showForks"
          >
            <template #start>
              <Icon name="ph:git-fork" :size="16" />
            </template>
            Show forks
          </Button>
          <template #tooltip>
            <p>{{ showForks ? 'Hide forked themes' : 'Show forked themes' }}</p>
          </template>
        </Tooltip>
      </Flex>
    </Flex>

    <Grid column gap="l" expand :columns="isMobile ? 1 : 2">
      <template v-if="loading">
        <div v-for="i in 6" :key="i" class="theme-card-skeleton">
          <div class="skeleton-preview" />
          <div class="skeleton-content">
            <Skeleton :height="24" width="55%" />
            <Skeleton :height="20" width="80%" />
            <Flex x-between y-center class="mt-m">
              <Skeleton :height="28" :width="96" :radius="8" />
              <Skeleton :height="28" :width="72" />
            </Flex>
          </div>
        </div>
      </template>

      <template v-else>
        <!-- Fake default theme card - always first in the official tab -->
        <ThemeCard
          v-if="activeTab === 'official' && currentPage === 1 && defaultCardMatchesSearch"
          :item="DEFAULT_THEME"
          :active-theme-id="activeTheme ? '' : '$default'"
          @apply="setActiveTheme(null)"
          @remove="setActiveTheme(null)"
        />

        <ThemeCard
          v-for="item in items"
          :key="item.id"
          :item="item"
          :active-theme-id="activeTheme?.id"
          @apply="setActiveTheme(item.id)"
          @remove="setActiveTheme(null)"
          @edit="emit('edit', item)"
          @deprecate="deprecateTheme(item.id)"
          @delete="deleteTheme(item.id)"
        />
      </template>
    </Grid>

    <template v-if="!loading && items.length === 0 && !(activeTab === 'official' && currentPage === 1 && defaultCardMatchesSearch)">
      <Card class="card-bg">
        <Flex x-center y-center expand class="p-l">
          <Icon name="ph:paint-brush-bold" :size="24" />
          <strong v-if="search.trim()">No themes match your search.</strong>
          <strong v-else-if="activeTab === 'created'">You've not created a theme yet!</strong>
          <strong v-else-if="activeTab === 'community'">No community themes available! Be the first to create one.</strong>
        </Flex>
      </Card>
    </template>

    <Flex v-if="pagination.totalPages > 1" x-center class="mt-l">
      <Pagination
        :pagination="pagination"
        numbers
        prev-next
        @change="onPageChange"
      />
    </Flex>
  </section>
</template>

<style scoped lang="scss">
.theme-card-skeleton {
  display: flex;
  flex-direction: column;
  width: 100%;
  border-radius: var(--border-radius-m);
  border: 1px solid var(--color-border);
  background-color: var(--color-bg-card);
  overflow: hidden;
  flex-grow: 1;

  .skeleton-preview {
    height: 120px;
    border-bottom: 1px solid var(--color-border);
    background-color: var(--color-bg-lowered);
  }

  .skeleton-content {
    display: flex;
    flex-direction: column;
    padding: var(--space-m);
    padding-top: var(--space-l);
    flex: 1;
    gap: var(--space-s);
  }
}
</style>
