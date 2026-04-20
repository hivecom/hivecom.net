<script setup lang="ts">
import type { Ref } from 'vue'
import type { Tables, TablesUpdate } from '@/types/database.overrides'
import type { Theme } from '@/types/theme'
import { Alert, defineTable, Flex, paginate, Pagination, Table } from '@dolanske/vui'
import { computed, inject, onBeforeMount, ref, watch } from 'vue'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import TinyBadge from '@/components/Shared/TinyBadge.vue'
import UserLink from '@/components/Shared/UserLink.vue'
import ThemeIcon from '@/components/Themes/ThemeIcon.vue'
import { useAdminPermissions } from '@/composables/useAdminPermissions'
import { useBreakpoint } from '@/lib/mediaQuery'
import { getRouteQueryString } from '@/lib/utils/common'
import ThemeDetails from './ThemeDetails.vue'
import ThemeFilters from './ThemeFilters.vue'

interface RpcTheme {
  id: string
  name: string
  description: string | null
  created_at: string
  created_by: string | null
  modified_at: string | null
  modified_by: string | null
  is_official: boolean
  is_unmaintained: boolean
  forked_from: string | null
  spacing: number
  rounding: number
  transitions: number
  widening: number
  dark_accent: string
  dark_bg_lowered: string
  dark_text_yellow: string
  dark_text_red: string
  dark_text_blue: string
  light_accent: string
  light_bg_lowered: string
  light_text_yellow: string
  light_text_red: string
  light_text_blue: string
  custom_css: string
  total_count: number
}

const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

const supabase = useSupabaseClient()
const route = useRoute()
const router = useRouter()
const isBelowMedium = useBreakpoint('<m')
const { hasPermission } = useAdminPermissions()

const canManageResource = computed(() =>
  hasPermission('themes.update') || hasPermission('themes.delete'),
)

// ─── State ────────────────────────────────────────────────────────────────────

const loading = ref(true)
const initialLoad = ref(true)
const errorMessage = ref('')
const themes = ref<RpcTheme[]>([])
const search = ref('')

// Required to provide VUI's TableSelectionProvideSymbol context for Table.Root
defineTable(themes, { pagination: { enabled: false }, select: false })

// ─── Pagination & sort ────────────────────────────────────────────────────────

const page = ref(1)
const adminTablePerPage = inject<Ref<number>>('adminTablePerPage', computed(() => 10))
const totalCount = ref(0)

const sortCol = ref('created_at')
const sortDir = ref<'asc' | 'desc'>('desc')

const paginationState = computed(() => paginate(totalCount.value, page.value, adminTablePerPage.value))
const shouldShowPagination = computed(() => totalCount.value > adminTablePerPage.value)

// ─── Detail state ─────────────────────────────────────────────────────────────

const selectedTheme = ref<Tables<'themes'> | null>(null)
const showThemeDetails = ref(false)

const focusedThemeId = computed(() => getRouteQueryString(route.query.theme))

// ─── Sort helpers ─────────────────────────────────────────────────────────────

const sortColMap: Record<string, string> = {
  'Name': 'name',
  'Created At': 'created_at',
}

function handleSort(label: string) {
  const col = sortColMap[label]
  if (!col)
    return
  if (sortCol.value === col) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  }
  else {
    sortCol.value = col
    sortDir.value = 'asc'
  }
  page.value = 1
  void fetchThemes()
}

function sortIcon(label: string): string {
  const col = sortColMap[label]
  if (sortCol.value !== col)
    return 'ph:arrows-down-up'
  return sortDir.value === 'asc' ? 'ph:arrow-up' : 'ph:arrow-down'
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchThemes() {
  loading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await supabase.rpc('get_admin_themes_paginated', {
      p_search: search.value,
      p_sort_col: sortCol.value,
      p_sort_dir: sortDir.value,
      p_limit: adminTablePerPage.value,
      p_offset: (page.value - 1) * adminTablePerPage.value,
    })

    if (error)
      throw error

    const rows = (data ?? []) as RpcTheme[]
    themes.value = rows
    totalCount.value = rows[0]?.total_count ?? 0
  }
  catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to load themes'
  }
  finally {
    initialLoad.value = false
    loading.value = false
  }
}

function setPage(p: number) {
  page.value = p
  void fetchThemes()
}

// ─── Detail open/close ────────────────────────────────────────────────────────

async function openThemeDetails(theme: RpcTheme) {
  showThemeDetails.value = true
  void router.replace({ query: { ...route.query, theme: theme.id } })

  const { data, error } = await supabase
    .from('themes')
    .select('*')
    .eq('id', theme.id)
    .single()

  if (!error && data)
    selectedTheme.value = data
}

watch(showThemeDetails, (open) => {
  if (!open) {
    const query = { ...route.query }
    delete query.theme
    void router.replace({ query })
  }
})

// ─── Actions ──────────────────────────────────────────────────────────────────

async function handleThemeDelete(themeId: string) {
  try {
    const { error } = await supabase
      .from('themes')
      .delete()
      .eq('id', themeId)
    if (error)
      throw error

    showThemeDetails.value = false
    await fetchThemes()
  }
  catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'An error occurred while deleting the theme'
  }
}

async function handleThemeUpdate(themeId: string, data: TablesUpdate<'themes'>) {
  try {
    const { error } = await supabase
      .from('themes')
      .update(data)
      .eq('id', themeId)
    if (error)
      throw error
    await fetchThemes()
  }
  catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'An error occurred while updating the theme'
  }
}

// ─── Watchers ─────────────────────────────────────────────────────────────────

// Debounced search
let searchDebounce: ReturnType<typeof setTimeout> | null = null
watch(search, () => {
  if (searchDebounce)
    clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    page.value = 1
    void fetchThemes()
  }, 300)
})

watch(refreshSignal, () => {
  page.value = 1
  void fetchThemes()
})

watch(adminTablePerPage, () => {
  page.value = 1
  void fetchThemes()
})

// ─── Initial load + URL-driven open ───────────────────────────────────────────

onBeforeMount(async () => {
  await fetchThemes()
  const id = focusedThemeId.value
  if (id) {
    const match = themes.value.find(t => t.id === id)
    if (match)
      await openThemeDetails(match)
  }
})
</script>

<template>
  <Flex column expand>
    <Alert v-if="errorMessage" variant="danger">
      {{ errorMessage }}
    </Alert>

    <Flex v-else-if="initialLoad" gap="s" column expand>
      <Flex
        :column="isBelowMedium"
        :x-between="!isBelowMedium"
        :x-start="isBelowMedium"
        y-center
        gap="s"
        expand
      >
        <ThemeFilters v-model:search="search" :expand="isBelowMedium" />
        <span class="text-color-lighter text-s">Total -</span>
      </Flex>
      <TableSkeleton :columns="5" :rows="10" :show-actions="canManageResource" />
    </Flex>

    <Flex v-else gap="s" column expand>
      <Flex
        :column="isBelowMedium"
        :x-between="!isBelowMedium"
        :x-start="isBelowMedium"
        y-center
        gap="s"
        expand
      >
        <ThemeFilters v-model:search="search" :expand="isBelowMedium" />
        <span class="text-color-lighter text-s">Total {{ totalCount }}</span>
      </Flex>

      <div class="table-loading-wrapper" :class="{ 'table-loading': loading && !initialLoad }">
        <TableContainer>
          <Table.Root v-if="themes.length > 0" separate-cells class="mb-l">
            <template #header>
              <Table.Head class="sortable-head" @click="handleSort('Name')">
                <Flex gap="xs" y-center>
                  Name
                  <Icon :name="sortIcon('Name')" size="14" class="sort-icon" />
                </Flex>
              </Table.Head>
              <Table.Head>Official</Table.Head>
              <Table.Head>Unmaintained</Table.Head>
              <Table.Head class="sortable-head" @click="handleSort('Created At')">
                <Flex gap="xs" y-center>
                  Created At
                  <Icon :name="sortIcon('Created At')" size="14" class="sort-icon" />
                </Flex>
              </Table.Head>
              <Table.Head>Created By</Table.Head>
              <Table.Head v-if="canManageResource" />
            </template>

            <template #body>
              <tr
                v-for="theme in themes"
                :key="theme.id"
                class="clickable-row"
                @click="openThemeDetails(theme)"
              >
                <Table.Cell>
                  <Flex gap="xs" y-center>
                    <ThemeIcon :theme="theme as unknown as Theme" size="s" />
                    <span>{{ theme.name }}</span>
                  </Flex>
                </Table.Cell>
                <Table.Cell>
                  <TinyBadge v-if="theme.is_official" variant="accent" size="xs" filled>
                    Official
                  </TinyBadge>
                  <span v-else class="text-color-lighter">-</span>
                </Table.Cell>
                <Table.Cell>
                  <TinyBadge v-if="theme.is_unmaintained" variant="warning" size="xs" filled>
                    Unmaintained
                  </TinyBadge>
                  <span v-else class="text-color-lighter">-</span>
                </Table.Cell>
                <Table.Cell>
                  <TimestampDate :date="theme.created_at" size="s" class="text-color" />
                </Table.Cell>
                <Table.Cell>
                  <UserLink v-if="theme.created_by" :user-id="theme.created_by" />
                  <span v-else class="text-color-light">-</span>
                </Table.Cell>
                <Table.Cell v-if="canManageResource" @click.stop>
                  <AdminActions
                    resource-type="themes"
                    :item="theme as unknown as Record<string, unknown>"
                    button-size="s"
                    :actions="['delete']"
                    @delete="(item) => handleThemeDelete((item as unknown as RpcTheme).id)"
                  />
                </Table.Cell>
              </tr>
            </template>

            <template v-if="shouldShowPagination" #pagination>
              <Pagination :pagination="paginationState" @change="setPage" />
            </template>
          </Table.Root>

          <Alert v-else-if="!loading" variant="info">
            No themes found
          </Alert>
        </TableContainer>
      </div>
    </Flex>
  </Flex>

  <ThemeDetails
    v-model:is-open="showThemeDetails"
    :theme="selectedTheme"
    @delete="(item) => handleThemeDelete((item as unknown as { id: string }).id)"
    @update="(id: string, data: TablesUpdate<'themes'>) => handleThemeUpdate(id, data)"
  />
</template>

<style scoped lang="scss">
.mb-l {
  margin-bottom: var(--space-l);
}

td {
  vertical-align: middle;
}

.clickable-row:hover {
  td {
    cursor: pointer;
    background-color: var(--color-bg-raised);
  }
}

.table-loading-wrapper {
  width: 100%;
  overflow: hidden;
  transition: opacity var(--transition-slow);
}

.table-loading {
  opacity: 0.4;
  pointer-events: none;
}

.sortable-head {
  cursor: pointer;
  user-select: none;

  &:hover {
    background-color: var(--color-bg-raised);
  }
}

.sort-icon {
  opacity: 0.5;
}
</style>
