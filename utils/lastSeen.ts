/**
 * Utility functions for handling user activity status
 */

export interface UserActivityStatus {
  isActive: boolean
  lastSeenText: string
  lastSeenTimestamp: Date
}

/**
 * Determines if a user is considered "active" based on their last seen timestamp
 * A user is considered active if they were last seen within the last 15 minutes
 */
export function getUserActivityStatus(lastSeen: string | Date): UserActivityStatus {
  const lastSeenDate = typeof lastSeen === 'string' ? new Date(lastSeen) : lastSeen
  const now = new Date()
  const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000) // 15 minutes in milliseconds

  const isActive = lastSeenDate > fifteenMinutesAgo

  // Format the "last seen" text
  const timeDiff = now.getTime() - lastSeenDate.getTime()
  const minutes = Math.floor(timeDiff / (1000 * 60))
  const hours = Math.floor(timeDiff / (1000 * 60 * 60))
  const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24))

  let lastSeenText: string

  if (isActive) {
    // Always show "Online" for active users (within 15 minutes)
    lastSeenText = 'Online'
  }
  else if (minutes < 60) {
    // Handle the case where user is inactive but still within the first hour (15-59 minutes)
    lastSeenText = `Last seen ${minutes} minutes ago`
  }
  else if (hours < 24) {
    if (hours === 1) {
      lastSeenText = 'Last seen 1 hour ago'
    }
    else {
      lastSeenText = `Last seen ${hours} hours ago`
    }
  }
  else if (days === 1) {
    lastSeenText = 'Last seen 1 day ago'
  }
  else if (days < 7) {
    lastSeenText = `Last seen ${days} days ago`
  }
  else {
    // For longer periods, show the actual date
    lastSeenText = `Last seen on ${lastSeenDate.toLocaleDateString()}`
  }

  return {
    isActive,
    lastSeenText,
    lastSeenTimestamp: lastSeenDate,
  }
}

/**
 * Updates the current user's last seen timestamp
 * This should be called periodically while the user is active in the app
 */
export async function updateCurrentUserLastSeen() {
  const supabase = useSupabaseClient()

  try {
    const { error } = await supabase.rpc('update_user_last_seen')

    if (error) {
      console.warn('Failed to update last seen:', error.message)
    }
  }
  catch (err) {
    console.warn('Error updating last seen:', err)
  }
}

/**
 * Sets up automatic last seen updates while the user is active
 * This composable should be used in the app layout or main component
 */
export function useLastSeenTracking() {
  const user = useSupabaseUser()
  let intervalId: NodeJS.Timeout | null = null

  const startTracking = () => {
    // Only run on client side
    if (import.meta.server || !user.value)
      return

    // Update immediately
    updateCurrentUserLastSeen()

    // Update every 5 minutes while active
    intervalId = setInterval(() => {
      updateCurrentUserLastSeen()
    }, 5 * 60 * 1000) // 5 minutes
  }

  const stopTracking = () => {
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  // Watch for user changes - only on client side
  watch(user, (newUser) => {
    if (import.meta.server)
      return

    if (newUser) {
      startTracking()
    }
    else {
      stopTracking()
    }
  }, { immediate: true })

  // Update on visibility change (when user returns to tab)
  const handleVisibilityChange = () => {
    if (import.meta.server)
      return
    if (!document.hidden && user.value) {
      updateCurrentUserLastSeen()
    }
  }

  // Update on focus (when user returns to window)
  const handleFocus = () => {
    if (import.meta.server || !user.value)
      return
    updateCurrentUserLastSeen()
  }

  onMounted(() => {
    // These are client-side only APIs
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
  })

  onUnmounted(() => {
    stopTracking()
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
