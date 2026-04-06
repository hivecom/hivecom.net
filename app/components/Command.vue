<script setup lang="ts">
import type { SearchType } from '@/composables/useCommand'
import type { SearchResult } from '@/composables/useDataSearch'
import { Flex, Spinner } from '@dolanske/vui'
import { commandLinks } from '@/config/navigation'

const LABEL_SPLIT_RE = /[\s/,&-]+/

const { isOpen, scope, openCommand, closeCommand } = useCommand()
const router = useRouter()
const user = useSupabaseUser()
const userId = useUserId()
const { user: userData } = useDataUser(userId, { includeRole: true, includeAvatar: false })
const userRole = computed(() => userData.value?.role ?? null)

// ─────────────────────────────────────────────────────────────────────────────
// Query + input
// ─────────────────────────────────────────────────────────────────────────────

const query = ref('')
const activeFilter = ref('all')
const inputRef = useTemplateRef<HTMLInputElement>('inputRef')

watch(isOpen, (open) => {
  if (open) {
    query.value = ''
    activeFilter.value = 'all'
    void nextTick(() => inputRef.value?.focus())
  }
})

const hasQuery = computed(() => query.value.trim().length > 0)

// ─────────────────────────────────────────────────────────────────────────────
// Filter chips
// ─────────────────────────────────────────────────────────────────────────────

interface FilterOption {
  key: string
  label: string
  types: SearchType[] | null
  navOnly?: boolean
}

const TYPE_LABELS: Record<SearchType, string> = {
  discussion_topic: 'Topics',
  discussion: 'Discussions',
  profile: 'Members',
  event: 'Events',
  gameserver: 'Servers',
  project: 'Projects',
}

const GLOBAL_FILTERS: FilterOption[] = [
  { key: 'all', label: 'All', types: null },
  { key: 'forum', label: 'Forum', types: ['discussion', 'discussion_topic'] },
  { key: 'profile', label: 'Members', types: ['profile'] },
  { key: 'event', label: 'Events', types: ['event'] },
  { key: 'gameserver', label: 'Servers', types: ['gameserver'] },
  { key: 'project', label: 'Projects', types: ['project'] },
  { key: 'nav', label: 'Navigation', types: null, navOnly: true },
]

// In scoped mode derive chips from the scope array itself
const filterOptions = computed<FilterOption[]>(() => {
  const s = scope.value
  if (s == null)
    return GLOBAL_FILTERS

  return [
    { key: 'all', label: 'All', types: s },
    ...s.map(type => ({
      key: type,
      label: TYPE_LABELS[type as SearchType] ?? type,
      types: [type] as SearchType[],
    })),
    { key: 'nav', label: 'Navigation', types: null, navOnly: true },
  ]
})

// True when the query starts with '/' - implicit nav-only shortcut
const isNavShortcut = computed(() => query.value.startsWith('/'))

// The query used for nav matching: strip leading '/' when using the shortcut
const navSearchQuery = computed(() =>
  isNavShortcut.value ? query.value.slice(1) : query.value,
)

// Nav-only mode: either the chip is selected or the '/' shortcut is active
const isNavOnly = computed(() =>
  activeFilter.value === 'nav' || isNavShortcut.value,
)

// The scope forwarded to useDataSearch: active filter's types or the base scope
const effectiveScope = computed<SearchType[] | null>(() => {
  const filter = filterOptions.value.find(f => f.key === activeFilter.value)
  if (filter == null || filter.key === 'all')
    return scope.value
  return filter.types
})

// Reset filter when scope changes (different open context)
watch(scope, () => {
  activeFilter.value = 'all'
})

// ─────────────────────────────────────────────────────────────────────────────
// Search
// ─────────────────────────────────────────────────────────────────────────────

const { results, loading } = useDataSearch(query, effectiveScope)

// ─────────────────────────────────────────────────────────────────────────────
// Result grouping
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string, icon: string }> = {
  discussion_topic: { label: 'Topics', icon: 'ph:folder' },
  discussion: { label: 'Discussions', icon: 'ph:chat-circle' },
  profile: { label: 'Members', icon: 'ph:user' },
  event: { label: 'Events', icon: 'ph:calendar' },
  gameserver: { label: 'Game Servers', icon: 'ph:game-controller' },
  project: { label: 'Projects', icon: 'ph:code' },
}

const groupedResults = computed(() => {
  const groups = new Map<string, SearchResult[]>()
  for (const result of results.value) {
    const group = groups.get(result.result_type) ?? []
    group.push(result)
    groups.set(result.result_type, group)
  }
  return groups
})

// Flat ordered list of results for keyboard nav
const flatResults = computed(() => results.value)

// ─────────────────────────────────────────────────────────────────────────────
// Default navigation links (shown when no query)
// ─────────────────────────────────────────────────────────────────────────────

const navItems = computed(() =>
  commandLinks.filter((link) => {
    if (link.requiresAuth && user.value == null)
      return false
    if (link.requiresRole && (userRole.value == null || !link.requiresRole.includes(userRole.value)))
      return false
    return true
  }),
)

const groupedNavItems = computed(() => {
  const groups = new Map<string, typeof navItems.value>()
  for (const link of navItems.value) {
    const group = groups.get(link.group) ?? []
    group.push(link)
    groups.set(link.group, group)
  }
  return groups
})

const flatNavItems = computed(() => [...groupedNavItems.value.values()].flat())

// Nav matches: client-side filter of commandLinks against the current query.
// Uses navSearchQuery so the '/' prefix is stripped before matching.
// Sorted by match quality: exact > prefix > contains.
function navScore(label: string, q: string): number {
  if (label === q)
    return 4
  if (label.startsWith(q))
    return 3
  const words = label.split(LABEL_SPLIT_RE).filter(Boolean)
  if (words.includes(q))
    return 2
  if (words.some(w => w.startsWith(q)))
    return 1
  return 0
}

const matchingNavItems = computed(() => {
  if (!hasQuery.value)
    return []
  const q = navSearchQuery.value.trim().toLowerCase()
  if (q.length === 0)
    return flatNavItems.value

  return flatNavItems.value
    .filter(link => link.label.toLowerCase().includes(q) || link.group.toLowerCase().includes(q))
    .sort((a, b) => navScore(b.label.toLowerCase(), q) - navScore(a.label.toLowerCase(), q))
})

// True when the top nav match is exact or prefix - hoist nav above DB results.
const navHasPriorityMatch = computed(() => {
  if (isNavOnly.value || matchingNavItems.value.length === 0)
    return false
  const q = navSearchQuery.value.trim().toLowerCase()
  return navScore(matchingNavItems.value[0]!.label.toLowerCase(), q) >= 1
})

const flatIndexMap = computed(() => {
  const map = new Map<string, number>()
  // When priority nav items are shown first, DB results are offset by their count.
  let i = navHasPriorityMatch.value ? matchingNavItems.value.length : 0
  for (const items of groupedResults.value.values()) {
    for (const item of items) {
      map.set(item.id, i++)
    }
  }
  return map
})

const isEmpty = computed(
  () => hasQuery.value && !loading.value && results.value.length === 0 && matchingNavItems.value.length === 0,
)

// ─────────────────────────────────────────────────────────────────────────────
// Keyboard navigation
// ─────────────────────────────────────────────────────────────────────────────

const focusedIndex = ref(-1)

// Reset focus when results or query mode changes
watch([flatResults, hasQuery], () => {
  focusedIndex.value = 0
})

const activeListLength = computed(() => {
  if (!hasQuery.value)
    return flatNavItems.value.length
  if (isNavOnly.value)
    return matchingNavItems.value.length
  return flatResults.value.length + matchingNavItems.value.length
})

function activateItem(index: number) {
  if (hasQuery.value) {
    if (isNavOnly.value) {
      const link = matchingNavItems.value[index]
      if (link != null) {
        void router.push(link.path)
        closeCommand()
      }
    }
    else if (navHasPriorityMatch.value) {
      // Nav first: 0..nav-1 = nav items, nav..end = DB results
      if (index < matchingNavItems.value.length) {
        const link = matchingNavItems.value[index]
        if (link != null) {
          void router.push(link.path)
          closeCommand()
        }
      }
      else {
        const result = flatResults.value[index - matchingNavItems.value.length]
        if (result != null) {
          void router.push(result.url)
          closeCommand()
        }
      }
    }
    else if (index < flatResults.value.length) {
      const result = flatResults.value[index]
      if (result != null) {
        void router.push(result.url)
        closeCommand()
      }
    }
    else {
      const link = matchingNavItems.value[index - flatResults.value.length]
      if (link != null) {
        void router.push(link.path)
        closeCommand()
      }
    }
  }
  else {
    const link = flatNavItems.value[index]
    if (link != null) {
      void router.push(link.path)
      closeCommand()
    }
  }
}

useEventListener('keydown', (e: KeyboardEvent) => {
  // Global Ctrl/Cmd+K toggle
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    if (isOpen.value) {
      closeCommand()
    }
    else {
      openCommand()
    }
    return
  }

  if (!isOpen.value)
    return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    focusedIndex.value = Math.min(focusedIndex.value + 1, activeListLength.value - 1)
  }
  else if (e.key === 'ArrowUp') {
    e.preventDefault()
    focusedIndex.value = Math.max(focusedIndex.value - 1, -1)
  }
  else if (e.key === 'Enter') {
    if (focusedIndex.value >= 0)
      activateItem(focusedIndex.value)
  }
  else if (e.key === 'Escape') {
    closeCommand()
  }
})

function navigate(url: string) {
  void router.push(url)
  closeCommand()
}

// ─────────────────────────────────────────────────────────────────────────────
// Scope label
// ─────────────────────────────────────────────────────────────────────────────

const scopeLabel = computed(() => {
  const s = scope.value
  if (s == null)
    return null
  if (s.includes('discussion') || s.includes('discussion_topic'))
    return 'Forum'
  return null
})
</script>

<template>
  <Teleport to="body">
    <Transition name="command">
      <div
        v-if="isOpen"
        class="command-overlay"
        @click.self="closeCommand"
      >
        <div
          class="command-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Search"
        >
          <!-- Input row -->
          <Flex class="command-input-row" y-center gap="s">
            <Icon
              v-if="!loading"
              name="ph:magnifying-glass"
              class="command-icon"
              size="18px"
            />
            <Spinner v-else class="command-icon" size="s" />

            <input
              ref="inputRef"
              v-model="query"
              class="command-input"
              :placeholder="scopeLabel != null ? `Search ${scopeLabel}...` : 'Search...'"
              autocomplete="off"
              spellcheck="false"
            >

            <span v-if="scopeLabel != null" class="command-scope-badge">
              {{ scopeLabel }}
            </span>
          </Flex>

          <!-- Filter chips -->
          <Flex class="command-filters" y-center gap="xs">
            <button
              v-for="filter in filterOptions"
              :key="filter.key"
              class="command-filter-chip"
              :class="{ 'command-filter-chip--active': activeFilter === filter.key }"
              @click="activeFilter = filter.key; void nextTick(() => inputRef?.focus())"
            >
              {{ filter.label }}
            </button>
          </Flex>

          <!-- Results (when query) -->
          <div v-if="hasQuery" class="command-results">
            <Flex v-if="isEmpty" class="command-state" y-center gap="s">
              <Icon name="ph:magnifying-glass-minus" size="16px" />
              No results for "{{ query }}"
            </Flex>

            <template v-else>
              <!-- Priority nav matches: hoisted above DB results -->
              <template v-if="!isNavOnly && navHasPriorityMatch && matchingNavItems.length > 0">
                <div class="command-group-label">
                  Navigation
                </div>
                <button
                  v-for="(link, i) in matchingNavItems"
                  :key="link.path"
                  class="command-item"
                  :class="{ 'command-item--focused': i === focusedIndex }"
                  @click="navigate(link.path)"
                  @mouseenter="focusedIndex = i"
                >
                  <div class="command-item-icon-wrap">
                    <Icon :name="link.icon" size="15px" />
                  </div>
                  <div class="command-item-body">
                    <span class="command-item-title">{{ link.label }}</span>
                  </div>
                </button>
              </template>

              <!-- DB results -->
              <template v-if="!isNavOnly">
                <template v-for="[type, items] in groupedResults" :key="type">
                  <div class="command-group-label">
                    {{ TYPE_META[type]?.label ?? type }}
                  </div>

                  <button
                    v-for="item in items"
                    :key="item.id"
                    class="command-item"
                    :class="{ 'command-item--focused': flatIndexMap.get(item.id) === focusedIndex }"
                    @click="navigate(item.url)"
                    @mouseenter="focusedIndex = flatIndexMap.get(item.id) ?? -1"
                  >
                    <div class="command-item-icon-wrap">
                      <Icon
                        :name="TYPE_META[type]?.icon ?? 'ph:file'"
                        size="15px"
                      />
                    </div>
                    <div class="command-item-body">
                      <span class="command-item-title">{{ item.title }}</span>
                      <span v-if="item.subtitle != null" class="command-item-sub">{{ item.subtitle }}</span>
                    </div>
                  </button>
                </template>
              </template>

              <!-- Nav matches: shown after DB results when no priority, or in nav-only mode -->
              <template v-if="matchingNavItems.length > 0 && (isNavOnly || !navHasPriorityMatch)">
                <div class="command-group-label">
                  Navigation
                </div>

                <button
                  v-for="(link, i) in matchingNavItems"
                  :key="link.path"
                  class="command-item"
                  :class="{ 'command-item--focused': (isNavOnly ? 0 : flatResults.length) + i === focusedIndex }"
                  @click="navigate(link.path)"
                  @mouseenter="focusedIndex = (isNavOnly ? 0 : flatResults.length) + i"
                >
                  <div class="command-item-icon-wrap">
                    <Icon :name="link.icon" size="15px" />
                  </div>
                  <div class="command-item-body">
                    <span class="command-item-title">{{ link.label }}</span>
                  </div>
                </button>
              </template>
            </template>
          </div>

          <!-- Default navigation (no query) -->
          <div v-else class="command-results">
            <template v-for="[group, links] in groupedNavItems" :key="group">
              <div class="command-group-label">
                {{ group }}
              </div>

              <button
                v-for="link in links"
                :key="link.path"
                class="command-item"
                :class="{ 'command-item--focused': flatNavItems.indexOf(link) === focusedIndex }"
                @click="navigate(link.path)"
                @mouseenter="focusedIndex = flatNavItems.indexOf(link)"
              >
                <div class="command-item-icon-wrap">
                  <Icon :name="link.icon" size="15px" />
                </div>
                <div class="command-item-body">
                  <span class="command-item-title">{{ link.label }}</span>
                </div>
              </button>
            </template>
          </div>

          <!-- Footer -->
          <Flex class="command-footer" y-center gap="m">
            <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
            <span><kbd>↵</kbd> open</span>
            <span><kbd>Esc</kbd> close</span>
          </Flex>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss">
.command-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
  padding-inline: var(--space-m);
}

.command-panel {
  background-color: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  width: 100%;
  max-width: 580px;
  overflow: hidden;
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.35);
}

// ── Input ──────────────────────────────────────────────────────────────────

.command-input-row {
  padding: 14px var(--space-m);
  border-bottom: 1px solid var(--color-border);
}

.command-icon {
  color: var(--color-text-lighter);
  flex-shrink: 0;
}

.command-input {
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  outline: none;
  font-size: var(--font-size-m);
  color: var(--color-text);

  &::placeholder {
    color: var(--color-text-lightest);
  }
}

.command-scope-badge {
  flex-shrink: 0;
  font-size: var(--font-size-xs);
  font-weight: 500;
  color: var(--color-accent);
  background-color: var(--color-bg-accent-lowered);
  border: 1px solid color-mix(in srgb, var(--color-accent) 30%, transparent);
  border-radius: 999px;
  padding: 2px var(--space-xs);
  white-space: nowrap;
}

// ── Filter chips ───────────────────────────────────────────────────────────

.command-filters {
  padding: var(--space-s) var(--space-m);
  border-bottom: 1px solid var(--color-border);
  overflow-x: auto;
  scrollbar-width: none;
  flex-wrap: nowrap;

  &::-webkit-scrollbar {
    display: none;
  }
}

.command-filter-chip {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 var(--space-s);
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: none;
  font-size: var(--font-size-xs);
  font-weight: 500;
  color: var(--color-text-lighter);
  cursor: pointer;
  transition: var(--transition);
  white-space: nowrap;

  &:hover {
    border-color: var(--color-border-strong);
    color: var(--color-text);
  }

  &--active {
    border-color: var(--color-accent);
    background-color: var(--color-bg-accent-lowered);
    color: var(--color-accent);

    &:hover {
      border-color: var(--color-accent);
      color: var(--color-accent);
    }
  }
}

// ── Results ────────────────────────────────────────────────────────────────

.command-results {
  max-height: 380px;
  overflow-y: auto;
  padding: var(--space-xs);
}

.command-group-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-lightest);
  padding: var(--space-xs) var(--space-s);
  margin-top: var(--space-xs);

  &:first-child {
    margin-top: 0;
  }
}

.command-item {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  width: 100%;
  padding: var(--space-s);
  border: none;
  border-radius: 10px;
  background: none;
  cursor: pointer;
  text-align: left;
  color: var(--color-text);
  transition: var(--transition);

  &:hover,
  &--focused {
    background-color: var(--color-bg-raised);

    .command-item-icon-wrap {
      color: var(--color-text-invert);

      .iconify {
        color: var(--color-text-invert);
      }
      background-color: var(--color-accent);
      border-color: var(--color-accent);
    }

    .command-item-title {
      color: var(--color-text);
    }
  }
}

.command-item-icon-wrap {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  border: 1px solid var(--color-border);
  background-color: var(--color-bg-lowered);
  color: var(--color-text-lighter);
  transition: var(--transition);
}

.command-item-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.command-item-title {
  font-size: var(--font-size-m);
  font-weight: 500;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: var(--transition);
}

.command-item-sub {
  font-size: var(--font-size-s);
  color: var(--color-text-lighter);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

// ── States ─────────────────────────────────────────────────────────────────

.command-state {
  padding: var(--space-l) var(--space-m);
  color: var(--color-text-lightest);
  font-size: var(--font-size-m);
}

// ── Footer ─────────────────────────────────────────────────────────────────

.command-footer {
  padding: var(--space-xs) var(--space-m);
  border-top: 1px solid var(--color-border);
  background-color: var(--color-bg-lowered);

  span {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: var(--font-size-xs);
    color: var(--color-text-lightest);
  }

  kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background-color: var(--color-bg-raised);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 1px 5px;
    font-size: var(--font-size-xs);
    font-family: inherit;
    color: var(--color-text-lighter);
  }
}

// ── Transition ─────────────────────────────────────────────────────────────

.command-enter-active {
  transition: opacity 0.15s ease;

  .command-panel {
    transition:
      transform 0.15s ease,
      opacity 0.15s ease;
  }
}

.command-leave-active {
  transition: opacity 0.1s ease;

  .command-panel {
    transition:
      transform 0.1s ease,
      opacity 0.1s ease;
  }
}

.command-enter-from,
.command-leave-to {
  opacity: 0;

  .command-panel {
    transform: translateY(-8px);
    opacity: 0;
  }
}
</style>
