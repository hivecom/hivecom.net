<script setup lang="ts">
import type { Command } from '@dolanske/vui'
import type { SearchType } from '@/composables/useCommand'
import { Commands } from '@dolanske/vui'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import { commandLinks } from '@/config/navigation'

const LABEL_SPLIT_RE = /[\s/,&-]+/

const { isOpen, scope, openCommand, closeCommand } = useCommand()
const router = useRouter()
const user = useSupabaseUser()
const userId = useUserId()
const { user: userData } = useDataUser(userId, { includeRole: true, includeAvatar: false })
const userRole = computed(() => userData.value?.role ?? null)

// ─────────────────────────────────────────────────────────────────────────────
// Search state (two-way bound to VUI Commands)
// ─────────────────────────────────────────────────────────────────────────────

const search = ref('')
const activeGroup = ref<string | null>('All')

watch(isOpen, (open) => {
  if (open) {
    search.value = ''
    activeGroup.value = 'All'
  }
})

// Reset group when scope changes (different open context)
watch(scope, () => {
  activeGroup.value = 'All'
})

// ─────────────────────────────────────────────────────────────────────────────
// /  shortcut: strip prefix + force Navigation group
// ─────────────────────────────────────────────────────────────────────────────

watch(search, (val) => {
  if (val.startsWith('/')) {
    search.value = val.slice(1)
    activeGroup.value = 'Navigation'
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Group -> scope mapping
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_META: Record<SearchType, { label: string, icon: string, group: string }> = {
  discussion_topic: { label: 'Topics', icon: 'ph:folder', group: 'Forum' },
  discussion: { label: 'Discussions', icon: 'ph:chat-circle', group: 'Forum' },
  profile: { label: 'Members', icon: 'ph:user', group: 'Members' },
  event: { label: 'Events', icon: 'ph:calendar', group: 'Events' },
  gameserver: { label: 'Game Servers', icon: 'ph:game-controller', group: 'Servers' },
  project: { label: 'Projects', icon: 'ph:code', group: 'Projects' },
}

// Maps a VUI group name back to the SearchType[] used for the DB query
const GROUP_TO_TYPES: Record<string, SearchType[]> = {
  Forum: ['discussion', 'discussion_topic'],
  Members: ['profile'],
  Events: ['event'],
  Servers: ['gameserver'],
  Projects: ['project'],
}

const effectiveScope = computed<SearchType[] | null>(() => {
  const g = activeGroup.value
  // Navigation group - no DB search needed
  if (g === 'Navigation')
    return null
  // Specific DB group selected
  if (g != null && g !== 'All' && GROUP_TO_TYPES[g] != null)
    return GROUP_TO_TYPES[g]!
  // All or null - use the contextual scope
  return scope.value
})

// ─────────────────────────────────────────────────────────────────────────────
// Search
// ─────────────────────────────────────────────────────────────────────────────

const { results, loading } = useDataSearch(search, effectiveScope)

// ─────────────────────────────────────────────────────────────────────────────
// Nav items
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

// Nav scoring for priority ranking
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
  const q = search.value.trim().toLowerCase()
  if (q.length === 0)
    return navItems.value
  return navItems.value
    .filter(link => link.label.toLowerCase().includes(q) || link.group.toLowerCase().includes(q))
    .sort((a, b) => navScore(b.label.toLowerCase(), q) - navScore(a.label.toLowerCase(), q))
})

// ─────────────────────────────────────────────────────────────────────────────
// Command list assembly
// ─────────────────────────────────────────────────────────────────────────────

const isNavOnly = computed(() => activeGroup.value === 'Navigation')

const commands = computed<Command[]>(() => {
  const navCommands: Command[] = matchingNavItems.value.map(link => ({
    title: link.label,
    group: 'Navigation',
    handler: () => {
      void router.push(link.path)
      closeCommand()
    },
  }))

  if (isNavOnly.value)
    return navCommands

  const q = search.value.trim()
  if (q.length === 0)
    return navCommands

  const dbCommands: Command[] = results.value.map(result => ({
    title: result.title,
    description: result.subtitle ?? undefined,
    group: TYPE_META[result.result_type]?.group ?? result.result_type,
    handler: () => {
      void router.push(result.url)
      closeCommand()
    },
  }))

  return [...dbCommands, ...navCommands]
})

// ─────────────────────────────────────────────────────────────────────────────
// Icon lookup (used in #icon slot)
// ─────────────────────────────────────────────────────────────────────────────

// Maps a group label back to an icon for nav commands, and uses TYPE_META for DB commands.
// Falls back to a generic icon if nothing matches.
const NAV_GROUP_ICONS: Record<string, string> = Object.fromEntries(
  commandLinks.map(link => [link.label, link.icon]),
)

function iconForCommand(command: Command): string {
  // DB result groups map directly via TYPE_META
  const typeMeta = Object.values(TYPE_META).find(m => m.group === command.group)
  if (typeMeta != null)
    return typeMeta.icon
  // Navigation items: look up by title
  return NAV_GROUP_ICONS[command.title] ?? 'ph:arrow-right'
}

// Maps username -> profile UUID for Members results so the #icon slot can
// render UserAvatar without adding non-standard fields to Command objects.
const profileIdByUsername = computed(() => {
  const map = new Map<string, string>()
  for (const result of results.value) {
    if (result.result_type === 'profile')
      map.set(result.title, result.id)
  }
  return map
})

// ─────────────────────────────────────────────────────────────────────────────
// Placeholder text
// ─────────────────────────────────────────────────────────────────────────────

const placeholder = computed(() => {
  const s = scope.value
  if (s == null)
    return 'Search or type / for navigation...'
  if (s.includes('discussion') || s.includes('discussion_topic'))
    return 'Search Forum...'
  return 'Search...'
})

// ─────────────────────────────────────────────────────────────────────────────
// Global Ctrl/Cmd+K toggle
// ─────────────────────────────────────────────────────────────────────────────

useEventListener('keydown', (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    if (isOpen.value) {
      closeCommand()
    }
    else {
      openCommand()
    }
  }
})
</script>

<template>
  <Commands
    v-model:search="search"
    v-model:group="activeGroup"
    :open="isOpen"
    :commands="commands"
    :loading="loading"
    :placeholder="placeholder"
    class="command-palette"
    @close="closeCommand"
  >
    <template #icon="{ command }">
      <UserAvatar
        v-if="command.group === 'Members' && profileIdByUsername.get(command.title) != null"
        :user-id="profileIdByUsername.get(command.title)"
        :size="22"
      />
      <Icon v-else :name="iconForCommand(command)" size="15px" />
    </template>
  </Commands>
</template>

<style lang="scss">
// VUI Commands renders as a Sheet (slides up from bottom or side).
// Our previous implementation was a centered overlay - visually different.
// TODO: If the Sheet presentation is not acceptable, raise a feature request
// with Jan for a "dialog" variant of Commands, or wrap in our own Teleport
// overlay and pass `open` conditionally.
//
// Minimal overrides only - let VUI own all the structural styles.
.command-palette {
  // Intentionally empty - VUI owns layout.
  // Add targeted overrides here only if the Sheet variant needs adjustments.
}
</style>
