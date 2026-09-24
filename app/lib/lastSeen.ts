import type { User } from '@supabase/supabase-js'
import type { WatchStopHandle } from 'vue'
import { isRef, onMounted, onUnmounted, ref, watch } from 'vue'
import { useCache } from '@/composables/useCache'
import { displayDate } from '@/lib/utils/date'

export type LastSeenVariant = 'online' | 'fresh' | 'light' | 'lighter' | 'lightest'

export function getLastSeenVariant(status: UserActivityStatus | null): LastSeenVariant {
  if (!status)
    return 'lightest'
  if (Number.isNaN(status.lastSeenTimestamp.getTime()))
    return 'lightest'
  if (status.isActive)
    return 'online'

  const diffMs = Date.now() - status.lastSeenTimestamp.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffHours < 24)
    return 'fresh'

  if (diffDays < 3)
    return 'light'

  if (diffDays < 14)
    return 'lighter'

  return 'lightest'
}

export function getLastSeenTextClass(variant: LastSeenVariant): string {
  switch (variant) {
    case 'online':
      return 'last-seen-online'

    case 'fresh':
      return 'text-color'

    case 'light':
      return 'text-color-light'

    case 'lighter':
      return 'text-color-lighter'

    case 'lightest':
      return 'text-color-lightest'
  }
}

export interface UserActivityStatus {
  isActive: boolean
  isAway: boolean
  lastSeenText: string
  lastSeenTimestamp: Date
}

/**
 * Active means seen in the last 15 minutes, away in the last 30. Pass `nowMs`,
 * usually the shared tick from useNow, or the text never ages.
 */
export function getUserActivityStatus(lastSeen: string | Date, nowMs: number = Date.now()): UserActivityStatus {
  const lastSeenDate = typeof lastSeen === 'string' ? new Date(lastSeen) : lastSeen
  const now = new Date(nowMs)
  const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000)
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)

  const isActive = lastSeenDate > fifteenMinutesAgo
  const isAway = !isActive && lastSeenDate > thirtyMinutesAgo

  const timeDiff = now.getTime() - lastSeenDate.getTime()
  const minutes = Math.floor(timeDiff / (1000 * 60))
  const hours = Math.floor(timeDiff / (1000 * 60 * 60))
  const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24))

  let lastSeenText: string

  if (isActive) {
    lastSeenText = 'Online'
  }
  else if (minutes < 60) {
    lastSeenText = `Last online ${minutes} minutes ago`
  }
  else if (hours < 24) {
    lastSeenText = hours === 1 ? 'Last online 1 hour ago' : `Last online ${hours} hours ago`
  }
  else if (days === 1) {
    lastSeenText = 'Last online 1 day ago'
  }
  else if (days < 7) {
    lastSeenText = `Last online ${days} days ago`
  }
  else {
    lastSeenText = `Last online on ${displayDate(lastSeenDate)}`
  }

  return {
    isActive,
    isAway,
    lastSeenText,
    lastSeenTimestamp: lastSeenDate,
  }
}

export async function updateCurrentUserLastSeen() {
  const supabase = useSupabaseClient()

  try {
    const { error } = await supabase.rpc('update_user_last_seen')

    if (error) {
      console.warn('Failed to update last seen:', error.message)
    }
    else {
      // So the online indicator updates right away.
      const { invalidateTable } = useCache()
      invalidateTable('profiles')
    }
  }
  catch (err) {
    console.warn('Error updating last seen:', err)
  }
}

// Meant for the app layout.
export function useLastSeenTracking() {
  function isRefUser(val: unknown): val is globalThis.Ref<User | null> {
    return isRef(val)
  }

  const getCurrentUser = (): globalThis.Ref<User | null> => {
    try {
      const user = useSupabaseUser() as unknown
      if (isRefUser(user)) {
        return user
      }
      return ref(null)
    }
    catch {
      return ref(null)
    }
  }

  const user = getCurrentUser()
  let intervalId: ReturnType<typeof setInterval> | null = null
  let unwatchUser: WatchStopHandle | null = null

  const startTracking = () => {
    if (import.meta.server === true || user.value === null || intervalId !== null)
      return

    void updateCurrentUserLastSeen()

    intervalId = setInterval(() => {
      void updateCurrentUserLastSeen()
    }, 5 * 60 * 1000)
  }

  const stopTracking = () => {
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  const handleVisibilityChange = () => {
    if (import.meta.server === true)
      return

    if (!document.hidden && user.value !== null) {
      void updateCurrentUserLastSeen()
    }
  }

  const handleFocus = () => {
    if (import.meta.server === true)
      return

    if (user.value !== null) {
      void updateCurrentUserLastSeen()
    }
  }

  onMounted(() => {
    if (import.meta.server === true)
      return

    unwatchUser ??= watch(
      () => user.value,
      (currentUser) => {
        if (currentUser) {
          startTracking()
        }
        else {
          stopTracking()
        }
      },
      { immediate: true },
    )

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
  })

  onUnmounted(() => {
    stopTracking()
    if (unwatchUser) {
      unwatchUser()
      unwatchUser = null
    }
    if (import.meta.client) {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  })

  return {
    startTracking,
    stopTracking,
    updateCurrentUserLastSeen,
  }
}
