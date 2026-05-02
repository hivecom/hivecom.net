import type { RealtimeChannel, RealtimePostgresInsertPayload } from '@supabase/supabase-js'
import type { Component } from 'vue'
import type { Database } from '@/types/database.types'
import { pushToast, removeToast } from '@dolanske/vui'
import ToastBodyFriendRequest from '@/components/Toast/ToastBodyFriendRequest.vue'
import ToastBodyNotification from '@/components/Toast/ToastBodyNotification.vue'
import { useDataUser } from '@/composables/useDataUser'
import { usePageVisibility } from '@/composables/usePageVisibility'

const BACKGROUND_POLL_INTERVAL_MS = 5 * 60 * 1000

const BIRTHDAY_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export interface NotificationRow {
  id: string
  user_id: string
  title: string
  body: string | null
  href: string | null
  is_read: boolean
  source: string | null
  source_id: string | null
  created_at: string
  created_by: string | null
  modified_at: string
  modified_by: string | null
}

// Singleton state - shared across all callers so the sheet and bell button
// stay in sync without double-fetching.
const loading = ref(false)
const error = ref<string | null>(null)
const unreadNotifications = ref<NotificationRow[]>([])
const friendships = ref<Array<{ id: number, friender: string, friend: string }>>([])
const profileMeta = ref<{ birthday: string | null, username: string } | null>(null)
const inviteActionLoading = ref<Record<string, boolean>>({})
const pendingComplaintCount = ref(0)

// Realtime - single channels shared across all composable instances.
let notificationChannel: RealtimeChannel | null = null
let friendChannel: RealtimeChannel | null = null
let subscribedUserId: string | null = null

// Background polling when tab is hidden.
let backgroundPollTimer: ReturnType<typeof setInterval> | null = null
let pausedUserId: string | null = null
let visibilityInitialized = false

function parseBirthdayDate(value: string | null): Date | null {
  if (value == null || value === '')
    return null

  const match = value.match(BIRTHDAY_DATE_RE)
  if (match) {
    const [, year, month, day] = match
    const date = new Date(Number(year), Number(month) - 1, Number(day))
    return Number.isNaN(date.getTime()) ? null : date
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function sourceIcon(source: string | null): string {
  switch (source) {
    case 'discussion_reply': return 'ph:chat-circle-dots'
    case 'discussion_reply_reply': return 'ph:chat-circle'
    case 'mention': return 'ph:at'
    case 'event_rescheduled': return 'ph:calendar'
    case null: return 'ph:bell'
    default: return 'ph:bell'
  }
}

function sourceLabel(source: string | null): string {
  switch (source) {
    case 'discussion_reply': return 'New discussion reply'
    case 'discussion_reply_reply': return 'New reply to your comment'
    case 'mention': return 'You were mentioned'
    case 'event_rescheduled': return 'Event rescheduled'
    case null: return 'New notification'
    default: return 'New notification'
  }
}

export function useDataNotifications() {
  const supabase = useSupabaseClient<Database>()
  const userId = useUserId()
  const { user: cachedUserData } = useDataUser(userId, { includeRole: true, includeAvatar: false })
  const userRole = computed(() => (cachedUserData.value?.role ?? null) as Database['public']['Enums']['app_role'] | null)

  const birthdayWidget = computed(() => {
    const birthdayValue = profileMeta.value?.birthday
    if (birthdayValue == null || birthdayValue === '')
      return null

    const parsed = parseBirthdayDate(birthdayValue)
    if (parsed == null)
      return null

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    let nextBirthday = new Date(today.getFullYear(), parsed.getMonth(), parsed.getDate())

    if (Number.isNaN(nextBirthday.getTime()))
      return null

    if (nextBirthday < today)
      nextBirthday = new Date(today.getFullYear() + 1, parsed.getMonth(), parsed.getDate())

    const msPerDay = 1000 * 60 * 60 * 24
    const daysUntil = Math.round((nextBirthday.getTime() - today.getTime()) / msPerDay)

    if (daysUntil !== 0)
      return null

    return {
      title: 'Happy Birthday!',
      description: 'Another year with us around the sun!',
    }
  })

  const pendingRequestIds = computed(() => {
    if (userId.value == null)
      return []

    const outgoing = new Set(
      friendships.value
        .filter(entry => entry.friender === userId.value)
        .map(entry => entry.friend),
    )

    return friendships.value
      .filter(entry => entry.friend === userId.value && !outgoing.has(entry.friender))
      .map(entry => entry.friender)
  })

  const KNOWN_SOURCES = new Set(['discussion_reply', 'mention', 'discussion_reply_reply'])

  const discussionNotifications = computed(() =>
    unreadNotifications.value.filter(n => n.source === 'discussion_reply'),
  )
  const mentionNotifications = computed(() =>
    unreadNotifications.value.filter(n => n.source === 'mention'),
  )
  const replyNotifications = computed(() =>
    unreadNotifications.value.filter(n => n.source === 'discussion_reply_reply'),
  )
  const genericNotifications = computed(() =>
    unreadNotifications.value.filter(n => !KNOWN_SOURCES.has(n.source ?? '')),
  )

  const unreadCount = computed(() =>
    pendingRequestIds.value.length
    + (birthdayWidget.value != null ? 1 : 0)
    + pendingComplaintCount.value
    + discussionNotifications.value.length
    + mentionNotifications.value.length
    + replyNotifications.value.length
    + genericNotifications.value.length,
  )

  const badgeText = computed(() => {
    if (unreadCount.value > 99)
      return '99+'
    if (unreadCount.value > 0)
      return unreadCount.value.toString()
    return ''
  })

  async function fetch() {
    if (userId.value == null) {
      friendships.value = []
      profileMeta.value = null
      inviteActionLoading.value = {}
      pendingComplaintCount.value = 0
      unreadNotifications.value = []
      loading.value = false
      error.value = null
      return
    }

    loading.value = true
    error.value = null

    try {
      const [friendsResponse, profileResponse, notificationsResponse] = await Promise.all([
        supabase
          .from('friends')
          .select('id, friender, friend')
          .or(`friender.eq.${userId.value},friend.eq.${userId.value}`),
        supabase
          .from('profiles')
          .select('id, username, birthday')
          .eq('id', userId.value)
          .single(),
        supabase.from('notifications')
          .select('*')
          .eq('user_id', userId.value)
          .eq('is_read', false)
          .order('modified_at', { ascending: false })
          .limit(20),
      ])

      if (friendsResponse.error)
        throw friendsResponse.error
      if (profileResponse.error)
        throw profileResponse.error

      friendships.value = friendsResponse.data ?? []
      profileMeta.value = profileResponse.data != null
        ? { birthday: profileResponse.data.birthday, username: profileResponse.data.username }
        : null
      inviteActionLoading.value = {}

      if (notificationsResponse.error) {
        unreadNotifications.value = []
      }
      else {
        unreadNotifications.value = notificationsResponse.data ?? []
      }

      pendingComplaintCount.value = 0

      if (userRole.value === 'admin' || userRole.value === 'moderator') {
        const complaintsResponse = await supabase
          .from('complaints')
          .select('id', { count: 'exact', head: true })
          .eq('acknowledged', false)
          .is('response', null)

        if (!complaintsResponse.error)
          pendingComplaintCount.value = complaintsResponse.count ?? 0
      }
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load notifications'
    }
    finally {
      loading.value = false
    }
  }

  function markRead(notificationId: string) {
    unreadNotifications.value = unreadNotifications.value.filter(n => n.id !== notificationId)
  }

  async function markAllAsRead() {
    if (userId.value == null)
      return

    const ids = unreadNotifications.value
      .filter(n => !n.id.startsWith('dev-'))
      .map(n => n.id)

    if (ids.length === 0) {
      unreadNotifications.value = []
      return
    }

    await supabase.from('notifications').update({ is_read: true }).in('id', ids)

    unreadNotifications.value = []
  }

  function setInviteLoading(id: string, state: boolean) {
    inviteActionLoading.value = { ...inviteActionLoading.value, [id]: state }
  }

  async function handleInviteAction(requestUserId: string, action: 'accept' | 'ignore') {
    if (userId.value == null)
      return

    setInviteLoading(requestUserId, true)

    try {
      if (action === 'accept') {
        await supabase.from('friends').insert({ friender: userId.value, friend: requestUserId })
      }
      else {
        await supabase.from('friends').delete().match({ friender: requestUserId, friend: userId.value })
      }
      await fetch()
    }
    catch (err) {
      console.error('Failed to update friend request', err)
      error.value = err instanceof Error ? err.message : 'Failed to update friend request'
    }
    finally {
      setInviteLoading(requestUserId, false)
    }
  }

  async function handleNotificationClick(notification: NotificationRow) {
    markRead(notification.id)

    if (!notification.id.startsWith('dev-')) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', notification.id)
    }
  }

  function subscribeRealtime(uid: string) {
    if (notificationChannel != null && subscribedUserId === uid)
      return

    void unsubscribeRealtime()

    notificationChannel = supabase
      .channel(`notifications:${uid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${uid}`,
        },
        (payload: RealtimePostgresInsertPayload<NotificationRow>) => {
          const incoming = payload.new
          // Avoid duplicates if the row somehow arrives twice.
          if (unreadNotifications.value.some(n => n.id === incoming.id))
            return

          unreadNotifications.value = [incoming, ...unreadNotifications.value]

          window.__hivecomActivitySignal?.()

          pushToast('', {
            body: ToastBodyNotification as Component,
            bodyProps: {
              icon: sourceIcon(incoming.source),
              title: sourceLabel(incoming.source),
              description: incoming.title,
              href: incoming.href,
              source: incoming.source,
              sourceId: incoming.source_id,
              notificationId: incoming.id,
              onNavigate: (notificationId: string) => {
                markRead(notificationId)
                void supabase.from('notifications').update({ is_read: true }).eq('id', notificationId)
              },
            },
          })
        },
      )
      .subscribe()

    friendChannel = supabase
      .channel(`friend-requests:${uid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'friends',
          filter: `friend=eq.${uid}`,
        },
        (payload: RealtimePostgresInsertPayload<{ id: number, friender: string, friend: string }>) => {
          const requesterId = payload.new.friender

          // Only show if we don't already have this friendship row (e.g. mutual request already accepted).
          const alreadyKnown = friendships.value.some(f => f.friender === requesterId && f.friend === uid)
          if (alreadyKnown)
            return

          // Optimistically add to local friendships so the badge and invite card update immediately.
          friendships.value = [...friendships.value, payload.new]

          pushToast('', {
            persist: true,
            body: ToastBodyFriendRequest as Component,
            bodyProps: {
              requesterId,
              onAccept: (toastId: number) => {
                removeToast(toastId)
                void handleInviteAction(requesterId, 'accept')
              },
              onDecline: (toastId: number) => {
                removeToast(toastId)
                void handleInviteAction(requesterId, 'ignore')
              },
            },
          })
        },
      )
      .subscribe()

    subscribedUserId = uid
  }

  async function unsubscribeRealtime() {
    const channels: Promise<unknown>[] = []

    if (notificationChannel != null) {
      const ch = notificationChannel
      notificationChannel = null
      channels.push(supabase.removeChannel(ch))
    }

    if (friendChannel != null) {
      const ch = friendChannel
      friendChannel = null
      channels.push(supabase.removeChannel(ch))
    }

    subscribedUserId = null
    await Promise.allSettled(channels)
  }

  // Wire realtime to userId lifecycle - subscribe when logged in, tear down on logout.
  watch(
    userId,
    (uid) => {
      if (uid != null)
        subscribeRealtime(uid)
      else
        void unsubscribeRealtime()
    },
    { immediate: true },
  )

  // Pause channels when tab is hidden; background-poll instead.
  // Guard ensures this only runs once across all composable instances.
  if (import.meta.client && !visibilityInitialized) {
    visibilityInitialized = true
    const { isHidden } = usePageVisibility()

    watch(isHidden, (hidden) => {
      if (hidden) {
        if (subscribedUserId != null) {
          pausedUserId = subscribedUserId
          void unsubscribeRealtime()
          backgroundPollTimer ??= setInterval(() => {
            void fetch()
          }, BACKGROUND_POLL_INTERVAL_MS)
        }
      }
      else {
        if (backgroundPollTimer != null) {
          clearInterval(backgroundPollTimer)
          backgroundPollTimer = null
        }
        if (pausedUserId != null) {
          const uid = pausedUserId
          pausedUserId = null
          // Re-subscribe then catch up on any missed notifications.
          subscribeRealtime(uid)
          void fetch()
        }
      }
    })
  }

  onScopeDispose(() => {
    void unsubscribeRealtime()
  })

  function reset() {
    friendships.value = []
    profileMeta.value = null
    inviteActionLoading.value = {}
    pendingComplaintCount.value = 0
    unreadNotifications.value = []
    error.value = null
  }

  return {
    // State
    loading: readonly(loading),
    error: readonly(error),
    unreadNotifications: readonly(unreadNotifications),
    friendships: readonly(friendships),
    pendingRequestIds,
    birthdayWidget,
    pendingComplaintCount: readonly(pendingComplaintCount),
    inviteActionLoading: readonly(inviteActionLoading),

    // Categorised unread
    discussionNotifications,
    mentionNotifications,
    replyNotifications,
    genericNotifications,

    // Badge
    unreadCount,
    badgeText,

    // Actions
    fetch,
    reset,
    markRead,
    markAllAsRead,
    handleInviteAction,
    handleNotificationClick,
    isInviteLoading: (id: string) => Boolean(inviteActionLoading.value[id]),
  }
}
