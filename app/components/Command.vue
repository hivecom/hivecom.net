<script setup lang="ts">
import type { Command } from '@dolanske/vui'
import type { SearchType } from '@/composables/useDataSearch'
import type { Database } from '@/types/database.types'
import { Commands, setColorTheme, theme } from '@dolanske/vui'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import { useDataForumTopics } from '@/composables/useDataForumTopics'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { commandLinks } from '@/config/navigation'

const LABEL_SPLIT_RE = /[\s/,&-]+/

const { isOpen, scope, openCommand, closeCommand } = useCommand()

const user = useSupabaseUser()
const userId = useUserId()
const { user: userData } = useDataUser(userId, { includeRole: true, includeAvatar: false })
const userRole = computed(() => userData.value?.role ?? null)

// Forum topics - used for pre-populated results when forum-scoped
const { topics: forumTopics } = useDataForumTopics()
const { settings } = useDataUserSettings()
const showArchived = computed(() => settings.value.show_forum_archived)

const topicById = computed(() => {
  const map = new Map<string, string>()
  for (const t of forumTopics.value)
    map.set(t.id, t.name)
  return map
})

// True when the scope is restricted to forum types (no nav items, pre-populate with topics)
const isForumScoped = computed(() =>
  scope.value != null
  && scope.value.length > 0
  && scope.value.every(t => t === 'discussion' || t === 'discussion_topic'),
)

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
// /  shortcut: strip prefix + force Commands group
// ─────────────────────────────────────────────────────────────────────────────

watch(search, (val) => {
  if (val.startsWith('/') && !isForumScoped.value) {
    search.value = val.slice(1)
    activeGroup.value = 'Commands'
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
  // Navigation and Commands groups - no DB search needed
  if (g === 'Navigation' || g === 'Commands')
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

const { results, loading } = useDataSearch(search, effectiveScope, showArchived)

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
// Quick commands
// These are static pre-populated entries that perform a DB query on activation.
// ─────────────────────────────────────────────────────────────────────────────

const supabase = useSupabaseClient<Database>()

const quickCommands = computed<Command[]>(() => [
  {
    title: 'Latest Discussion',
    description: 'Jump to the most recently active discussion',
    group: 'Commands',
    handler: async () => {
      const { data } = await supabase
        .from('discussions')
        .select('id, slug')
        .eq('is_draft', false)
        .eq('is_archived', false)
        .not('title', 'is', null)
        .is('profile_id', null)
        .is('event_id', null)
        .is('referendum_id', null)
        .is('project_id', null)
        .is('gameserver_id', null)
        .not('discussion_topic_id', 'is', null)
        .order('last_activity_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (data != null) {
        navigateTo(`/forum/${data.slug ?? data.id}`)
        closeCommand()
      }
    },
  },
  ...(user.value != null
    ? [{
        title: 'New Discussion',
        description: 'Start a new forum discussion',
        group: 'Commands',
        handler: () => {
          navigateTo('/forum?new=discussion')
          closeCommand()
        },
      }]
    : []),
  {
    title: 'Latest Event',
    description: 'Jump to the next upcoming event',
    group: 'Commands',
    handler: async () => {
      const now = new Date().toISOString()
      const { data } = await supabase
        .from('events')
        .select('id')
        .gte('date', now)
        .order('date', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (data != null) {
        navigateTo(`/events/${data.id}`)
        closeCommand()
      }
    },
  },
  {
    title: theme.value === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode',
    description: `Changes the theme variant to ${theme.value === 'light' ? 'dark' : 'light'}`,
    group: 'Commands',
    handler: () => {
      const newTheme = theme.value === 'light' ? 'dark' : 'light'
      setColorTheme(newTheme)
      settings.value.theme = newTheme
      closeCommand()
    },
  },
])

// ─────────────────────────────────────────────────────────────────────────────
// Command list assembly
// ─────────────────────────────────────────────────────────────────────────────

const isNavOnly = computed(() => activeGroup.value === 'Navigation')
const isCommandsOnly = computed(() => activeGroup.value === 'Commands')

const commands = computed<Command[]>(() => {
  // Forum-scoped: never show nav items
  if (isForumScoped.value) {
    const q = search.value.trim()

    // Empty query - pre-populate with topics from cache, respecting archived setting
    if (q.length === 0) {
      return forumTopics.value
        .filter(t => showArchived.value || !t.is_archived)
        .map(t => ({
          title: t.name,
          description: t.is_archived ? '[Archived]' : (t.description ?? undefined),
          group: 'Forum',
          handler: () => {
            navigateTo(`/forum?topic=${t.slug}`)
            closeCommand()
          },
        }))
    }

    // Active query - client-side filter topics while DB results are loading or below min length
    const ql = q.toLowerCase()
    const matchingTopics = forumTopics.value
      .filter(t => (showArchived.value || !t.is_archived) && (t.name.toLowerCase().includes(ql) || (t.description ?? '').toLowerCase().includes(ql)))

    const dbCommands: Command[] = results.value.map(dbResultToCommand)

    // Exclude topics already returned by DB to avoid duplicates
    const dbTopicIds = new Set(
      results.value.filter(r => r.result_type === 'discussion_topic').map(r => r.id),
    )
    const filteredTopics: Command[] = matchingTopics
      .filter(t => !dbTopicIds.has(t.id))
      .map(t => ({
        title: t.name,
        description: t.is_archived ? '[Archived]' : (t.description ?? undefined),
        group: 'Forum',
        handler: () => {
          navigateTo(`/forum?topic=${t.slug}`)
          closeCommand()
        },
      }))

    return [...dbCommands, ...filteredTopics]
  }

  const navCommands: Command[] = matchingNavItems.value.map(link => ({
    title: link.label,
    group: 'Navigation',
    handler: () => {
      navigateTo(link.path)
      closeCommand()
    },
  }))

  if (isNavOnly.value)
    return navCommands

  if (isCommandsOnly.value) {
    const q = search.value.trim()
    const ql = q.toLowerCase()
    const matching = q.length === 0
      ? quickCommands.value
      : quickCommands.value.filter(
          c => c.title.toLowerCase().includes(ql) || (c.description ?? '').toLowerCase().includes(ql),
        )
    return [...matching, ...navCommands]
  }

  const q = search.value.trim()
  if (q.length === 0)
    return navCommands

  const ql = q.toLowerCase()

  const dbCommands: Command[] = results.value.map(dbResultToCommand)

  const dbTopicIds = new Set(
    results.value.filter(r => r.result_type === 'discussion_topic').map(r => r.id),
  )
  const topicCommands: Command[] = forumTopics.value
    .filter(t => (showArchived.value || !t.is_archived) && (t.name.toLowerCase().includes(ql) || (t.description ?? '').toLowerCase().includes(ql)))
    .filter(t => !dbTopicIds.has(t.id))
    .map(t => ({
      title: t.name,
      description: t.is_archived ? '[Archived]' : (t.description ?? undefined),
      group: 'Forum',
      handler: () => {
        navigateTo(`/forum?topic=${t.slug}`)
        closeCommand()
      },
    }))

  return [...dbCommands, ...topicCommands, ...navCommands]
})

// ─────────────────────────────────────────────────────────────────────────────
// Icon lookup (used in #icon slot)
// ─────────────────────────────────────────────────────────────────────────────

// Maps a group label back to an icon for nav commands, and uses TYPE_META for DB commands.
// Falls back to a generic icon if nothing matches.
const NAV_GROUP_ICONS: Record<string, string> = Object.fromEntries(
  commandLinks.map(link => [link.label, link.icon]),
)

function dbResultToCommand(result: import('@/composables/useDataSearch').SearchResult): Command {
  const archivedPrefix = result.is_archived ? '[Archived] ' : ''
  const topicName = result.topic_id != null ? topicById.value.get(result.topic_id) : null
  const body = [topicName, result.subtitle].filter(s => s != null && s !== '').join(' · ')
  return {
    title: result.title,
    description: archivedPrefix + body || undefined,
    group: TYPE_META[result.result_type]?.group ?? result.result_type,
    handler: () => {
      navigateTo(result.url)
      closeCommand()
    },
  }
}

// Maps title -> result_type for DB results so the icon slot can differentiate
// discussion topics (folder) from discussions (chat bubble) within the same group.
const resultTypeByTitle = computed(() => {
  const map = new Map<string, string>()
  for (const result of results.value)
    map.set(result.title, result.result_type)
  return map
})

function iconForCommand(command: Command): string {
  // Quick commands have fixed icons keyed on title
  if (command.group === 'Commands') {
    if (command.title === 'Latest Discussion')
      return 'ph:chat-circle'
    if (command.title === 'New Discussion')
      return 'ph:pencil-simple'
    if (command.title === 'Latest Event')
      return 'ph:calendar'
    if (command.title.startsWith('Switch to'))
      return theme.value === 'light' ? 'ph:moon' : 'ph:sun'
  }
  // Differentiate discussions from topics within the Forum group
  if (command.group === 'Forum') {
    const resultType = resultTypeByTitle.value.get(command.title)
    if (resultType === 'discussion')
      return 'ph:chat-circle'
    // Pre-populated topics and discussion_topic DB results both get folder
    return 'ph:folder'
  }
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
    return 'Search everything or type / for commands...'
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
