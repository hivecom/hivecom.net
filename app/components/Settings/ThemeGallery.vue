<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { Button, Card, Flex, Grid, Input, paginate, Pagination, Skeleton, Tab, Tabs } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'
import ThemeCard from './ThemeCard.vue'

const emit = defineEmits<{
  create: []
  edit: [theme: Tables<'themes'>]
}>()

const supabase = useSupabaseClient<Database>()
const userId = useUserId()

const { activeTheme, setActiveTheme } = useUserTheme()
const { softDelete, hardDelete } = useDataThemes()

const activeTab = ref<'community' | 'official' | 'created'>('official')
const search = ref('')
const currentPage = ref(1)
const PER_PAGE = 8

// Per-tab state
const items = ref<Tables<'themes'>[]>([])
const totalCount = ref(0)
const loading = ref(false)
const error = ref<string | null>(null)

async function fetchPage(tab: typeof activeTab.value, page: number, searchValue: string) {
  loading.value = true
  error.value = null
  items.value = []

  const from = (page - 1) * PER_PAGE
  const to = from + PER_PAGE - 1

  try {
    let query = supabase
      .from('themes')
      .select('*', { count: 'exact' })

    if (searchValue.trim()) {
      query = query.or(`name.ilike.%${searchValue}%,description.ilike.%${searchValue}%`)
    }

    switch (tab) {
      case 'official':
        query = query.eq('is_official', true)
        break
      case 'community':
        query = query.eq('is_official', false).not('created_by', 'is', null)
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
      query = query.order('name', { ascending: true })
    }
    else {
      query = query.order('is_unmaintained', { ascending: true }).order('name', { ascending: true })
    }

    query = query.range(from, to)

    const { data, count, error: fetchError } = await query

    if (fetchError)
      throw fetchError

    items.value = data ?? []
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
  return 'default theme'.includes(q) || 'the default hivecom theme'.includes(q)
})

const pagination = computed(() =>
  paginate(totalCount.value, currentPage.value, PER_PAGE),
)

// Reset page and re-fetch when tab or search changes
watch(activeTab, () => {
  currentPage.value = 1
  search.value = ''
  void fetchPage(activeTab.value, 1, '')
})

watch(search, () => {
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

defineExpose({ refresh })
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
      <Tab v-if="userId" value="created">
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

    <Flex x-start y-center class="mb-s">
      <Input v-model="search" placeholder="Search themes..." class="search-input" />
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
          :item="{
            id: '$$$$default',
            created_by: null,
            name: 'Default Theme',
            description: 'The default Hivecom theme',
          } as any"
          :active-theme-id="activeTheme ? '' : '$$$$default'"
          @apply="setActiveTheme(null)"
        />

        <ThemeCard
          v-for="item in items"
          :key="item.id"
          :item="item"
          :active-theme-id="activeTheme?.id"
          @apply="setActiveTheme(item.id)"
          @edit="emit('edit', item)"
          @deprecate="deprecateTheme(item.id)"
          @delete="deleteTheme(item.id)"
        />
      </template>
    </Grid>

    <template v-if="!loading && items.length === 0">
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
.search-input {
  width: 100%;
  max-width: 328px;
}

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
