import type { Database } from '@/types/database.types'
import { useSupabaseUser } from '#imports'

export type LinkPreviewType = 'forum-discussion' | 'profile' | 'gameserver' | 'event' | 'vote' | 'unknown'

export interface LinkPreviewDiscussion {
  type: 'forum-discussion'
  href: string
  title: string
  description: string | null
  authorUsername: string | null
  replyCount: number
  commentId: string | null
  replyContent: string | null
  replyAuthorUsername: string | null
}

export interface LinkPreviewProfile {
  type: 'profile'
  href: string
  username: string
  introduction: string | null
  userId: string
  isPublic: boolean
}

export interface LinkPreviewUnknown {
  type: 'unknown'
  href: string
  label: string
}

export interface LinkPreviewGameserver {
  type: 'gameserver'
  href: string
  name: string
  description: string | null
  region: string | null
  gameName: string | null
  gameShorthand: string | null
  containerState: 'healthy' | 'running' | 'unhealthy' | 'offline' | 'unknown'
  addresses: string[] | null
  port: string | null
}

export interface LinkPreviewEvent {
  type: 'event'
  href: string
  title: string
  description: string | null
  date: string | null
  durationMinutes: number | null
  location: string | null
}

export interface LinkPreviewVote {
  type: 'vote'
  href: string
  referendumId: number
  title: string
  description: string | null
  dateStart: string | null
  dateEnd: string | null
  choices: string[]
  multipleChoice: boolean
  status: 'active' | 'upcoming' | 'concluded'
  voteCount: number
}

export type LinkPreviewData = LinkPreviewDiscussion | LinkPreviewProfile | LinkPreviewGameserver | LinkPreviewEvent | LinkPreviewVote | LinkPreviewUnknown

// ---------------------------------------------------------------------------
// URL parsing
// ---------------------------------------------------------------------------

const FORUM_PATH_RE = /^\/forum\/([^/?#]+)/
const PROFILE_PATH_RE = /^\/profile\/([^/?#]+)/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const GAMESERVER_PATH_RE = /^\/servers\/gameservers\/(\d+)/
const EVENT_PATH_RE = /^\/events\/(\d+)/
const VOTE_PATH_RE = /^\/votes\/(\d+)/
const DISCUSSION_SELECT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ABSOLUTE_URL_RE = /^https?:\/\//i

export interface ParsedForumUrl {
  type: 'forum-discussion'
  slug: string
  commentId: string | null
  href: string
}

export interface ParsedProfileUrl {
  type: 'profile'
  userId?: string
  username?: string
  href: string
}

export interface ParsedGameserverUrl {
  type: 'gameserver'
  id: number
  href: string
}

export interface ParsedEventUrl {
  type: 'event'
  id: number
  href: string
}

export interface ParsedVoteUrl {
  type: 'vote'
  id: number
  href: string
}

export type ParsedInternalUrl = ParsedForumUrl | ParsedProfileUrl | ParsedGameserverUrl | ParsedEventUrl | ParsedVoteUrl

/**
 * Returns structured info if the URL is a recognised internal hivecom path,
 * or null if it is external / unrecognised.
 */
export function parseInternalUrl(raw: string): ParsedInternalUrl | null {
  let pathname: string
  let search: string
  let href: string

  try {
    const isAbsolute = ABSOLUTE_URL_RE.test(raw)
    if (isAbsolute) {
      const u = new URL(raw)
      const host = u.hostname
      const isKnownHost = host.endsWith('hivecom.net')
        || (import.meta.dev && (host === 'localhost' || host === '127.0.0.1' || host === '::1'))
      if (!isKnownHost)
        return null
      pathname = u.pathname
      search = u.search
      href = pathname + search
    }
    else {
      const u = new URL(raw, 'https://hivecom.net')
      pathname = u.pathname
      search = u.search
      href = pathname + search
    }
  }
  catch {
    return null
  }

  const forumMatch = FORUM_PATH_RE.exec(pathname)
  if (forumMatch) {
    const params = new URLSearchParams(search)
    const commentId = params.get('comment')
    return { type: 'forum-discussion', slug: forumMatch[1]!, commentId, href }
  }

  const profileMatch = PROFILE_PATH_RE.exec(pathname)
  if (profileMatch) {
    const identifier = profileMatch[1]!
    if (UUID_RE.test(identifier)) {
      return { type: 'profile', userId: identifier, href }
    }
    else {
      return { type: 'profile', username: identifier, href }
    }
  }

  const gameserverMatch = GAMESERVER_PATH_RE.exec(pathname)
  if (gameserverMatch) {
    return { type: 'gameserver', id: Number(gameserverMatch[1]!), href }
  }

  const eventMatch = EVENT_PATH_RE.exec(pathname)
  if (eventMatch) {
    return { type: 'event', id: Number(eventMatch[1]!), href }
  }

  const voteMatch = VOTE_PATH_RE.exec(pathname)
  if (voteMatch) {
    return { type: 'vote', id: Number(voteMatch[1]!), href }
  }

  return null
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

/**
 * Fetches a rich preview for a single internal hivecom URL.
 *
 * Usage:
 *   const { data, loading, error } = useDataLinkPreview(url)
 */
export function useDataLinkPreview(url: string) {
  const supabase = useSupabaseClient<Database>()

  const data = ref<LinkPreviewData | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const parsed = parseInternalUrl(url)

  async function fetchDiscussion(slug: string, commentId: string | null, href: string) {
    const isUuid = DISCUSSION_SELECT_UUID_RE.test(slug)

    const baseQuery = supabase
      .from('discussions')
      .select('id, title, description, slug, reply_count, created_by, profiles!discussions_created_by_fkey(username)')
      .not('discussion_topic_id', 'is', null)

    const { data: row, error: fetchError } = isUuid
      ? await baseQuery.eq('id', slug).maybeSingle()
      : await baseQuery.eq('slug', slug).maybeSingle()

    if (fetchError)
      throw new Error(fetchError.message)

    if (!row) {
      data.value = { type: 'unknown', href, label: href }
      return
    }

    interface ProfileJoin { username: string | null }
    const profileRaw: ProfileJoin | ProfileJoin[] | null = row.profiles
    // eslint-disable-next-line ts/no-unsafe-assignment
    const profile: ProfileJoin | null | undefined = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw

    let replyContent: string | null = null
    let replyAuthorUsername: string | null = null

    if (commentId != null && commentId !== '') {
      interface ReplyProfileJoin { username: string | null }
      interface ReplyRow {
        markdown: string
        is_deleted: boolean
        profiles: ReplyProfileJoin | ReplyProfileJoin[] | null
      }
      const { data: replyRow, error: replyError } = await supabase
        .from('discussion_replies')
        .select('markdown, is_deleted, profiles!discussion_replies_created_by_fkey(username)')
        .eq('id', commentId)
        .maybeSingle() as { data: ReplyRow | null, error: { message: string } | null }

      if (!replyError && replyRow != null && !replyRow.is_deleted) {
        replyContent = replyRow.markdown

        const replyProfileRaw: ReplyProfileJoin | ReplyProfileJoin[] | null = replyRow.profiles
        const replyProfile: ReplyProfileJoin | null | undefined = Array.isArray(replyProfileRaw)
          ? replyProfileRaw[0]
          : replyProfileRaw
        replyAuthorUsername = replyProfile?.username ?? null
      }
    }

    data.value = {
      type: 'forum-discussion',
      href,
      title: row.title ?? 'Untitled',
      description: row.description ?? null,
      authorUsername: profile?.username ?? null,
      replyCount: row.reply_count ?? 0,
      commentId,
      replyContent,
      replyAuthorUsername,
    }
  }

  async function fetchGameserver(id: number, href: string) {
    const { data: row, error: fetchError } = await supabase
      .from('gameservers')
      .select(`
        id, name, description, region, game, addresses, port,
        container (
          running, healthy,
          server ( docker_control, accessible )
        )
      `)
      .eq('id', id)
      .maybeSingle()

    if (fetchError)
      throw new Error(fetchError.message)

    if (!row) {
      data.value = { type: 'unknown', href, label: href }
      return
    }

    let gameName: string | null = null
    let gameShorthand: string | null = null
    if (row.game != null) {
      const gameResult = await supabase
        .from('games')
        .select('name, shorthand')
        .eq('id', row.game)
        .maybeSingle()
      interface GameRow { name: string | null, shorthand: string | null }
      const gameRow: GameRow | null = gameResult.data
      gameName = gameRow?.name ?? null
      gameShorthand = gameRow?.shorthand ?? null
    }

    // Derive container state the same way the gameserver detail page does
    interface ContainerJoin {
      running: boolean
      healthy: boolean | null
      server: { docker_control: boolean | null, accessible: boolean | null } | null
    }
    const container = row.container as ContainerJoin | null
    let containerState: LinkPreviewGameserver['containerState'] = 'unknown'
    if (container != null) {
      if (container.server?.docker_control === false || container.server?.accessible === false) {
        containerState = 'unknown'
      }
      else if (container.running && container.healthy === null) {
        containerState = 'running'
      }
      else if (container.running && container.healthy) {
        containerState = 'healthy'
      }
      else if (container.running && !container.healthy) {
        containerState = 'unhealthy'
      }
      else {
        containerState = 'offline'
      }
    }

    data.value = {
      type: 'gameserver',
      href,
      name: row.name,
      description: row.description ?? null,
      region: row.region ?? null,
      gameName,
      gameShorthand,
      containerState,
      addresses: row.addresses,
      port: row.port,
    } satisfies LinkPreviewGameserver
  }

  async function fetchEvent(id: number, href: string) {
    const { data: row, error: fetchError } = await supabase
      .from('events')
      .select('id, title, description, date, duration_minutes, location')
      .eq('id', id)
      .maybeSingle()

    if (fetchError)
      throw new Error(fetchError.message)

    if (!row) {
      data.value = { type: 'unknown', href, label: href }
      return
    }

    data.value = {
      type: 'event',
      href,
      title: row.title,
      description: row.description ?? null,
      date: row.date ?? null,
      durationMinutes: row.duration_minutes ?? null,
      location: row.location ?? null,
    } satisfies LinkPreviewEvent
  }

  async function fetchVote(id: number, href: string) {
    const user = useSupabaseUser()

    // Unauthenticated users cannot interact with votes - skip the fetch and
    // return a minimal stub so the embed can render a sign-in prompt instead.
    if (!user.value) {
      data.value = {
        type: 'vote',
        href,
        referendumId: id,
        title: '',
        description: null,
        dateStart: null,
        dateEnd: null,
        choices: [],
        multipleChoice: false,
        status: 'active',
        voteCount: 0,
      }
      return
    }

    const { data: row, error: fetchError } = await supabase
      .from('referendums')
      .select('id, title, description, date_start, date_end, is_public, choices, multiple_choice')
      .eq('id', id)
      .maybeSingle()

    if (fetchError)
      throw new Error(fetchError.message)

    if (!row || !row.is_public) {
      data.value = { type: 'unknown', href, label: href }
      return
    }

    const { count: voteCount } = await supabase
      .from('referendum_votes')
      .select('id', { count: 'exact', head: true })
      .eq('referendum_id', row.id)

    const now = new Date()
    const start = new Date(row.date_start)
    const end = new Date(row.date_end)
    const status: LinkPreviewVote['status'] = now < start ? 'upcoming' : now <= end ? 'active' : 'concluded'

    data.value = {
      type: 'vote',
      href,
      referendumId: row.id,
      title: row.title,
      description: row.description ?? null,
      dateStart: row.date_start ?? null,
      dateEnd: row.date_end ?? null,
      choices: row.choices,
      multipleChoice: row.multiple_choice,
      status,
      voteCount: voteCount ?? 0,
    }
  }

  async function fetchProfile(parsed: ParsedProfileUrl) {
    const { href } = parsed
    const query = supabase
      .from('profiles')
      .select('id, username, introduction, public')

    const { data: row, error: fetchError } = (parsed.userId != null && parsed.userId !== '')
      ? await query.eq('id', parsed.userId).maybeSingle()
      : await query.eq('username', parsed.username ?? '').maybeSingle()

    if (fetchError)
      throw new Error(fetchError.message)

    // Private profiles are invisible to anon via RLS (row is null) and also
    // explicitly marked public=false for authenticated users. In both cases
    // we still want to render a profile embed - just without real data.
    if (!row || !row.public) {
      const fallbackUserId = row?.id ?? parsed.userId ?? ''
      data.value = {
        type: 'profile',
        href,
        username: row?.username ?? '',
        introduction: null,
        userId: fallbackUserId,
        isPublic: false,
      } satisfies LinkPreviewProfile
      return
    }

    data.value = {
      type: 'profile',
      href,
      username: row.username,
      introduction: row.introduction ?? null,
      userId: row.id,
      isPublic: true,
    } satisfies LinkPreviewProfile
  }

  onMounted(async () => {
    if (!parsed) {
      data.value = { type: 'unknown', href: url, label: url }
      return
    }

    loading.value = true
    error.value = null

    try {
      if (parsed.type === 'forum-discussion') {
        await fetchDiscussion(parsed.slug, parsed.commentId, parsed.href)
      }
      else if (parsed.type === 'profile') {
        await fetchProfile(parsed)
      }
      else if (parsed.type === 'gameserver') {
        await fetchGameserver(parsed.id, parsed.href)
      }
      else if (parsed.type === 'event') {
        await fetchEvent(parsed.id, parsed.href)
      }
      else if (parsed.type === 'vote') {
        await fetchVote(parsed.id, parsed.href)
      }
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load preview'
      data.value = { type: 'unknown', href: url, label: url }
    }
    finally {
      loading.value = false
    }
  })

  return { data, loading, error, parsed }
}
