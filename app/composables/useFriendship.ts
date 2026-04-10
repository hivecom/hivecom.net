import type { ComputedRef, Ref } from 'vue'
import type { Database } from '@/types/database.types'
import type { ProfileFriendshipStatus } from '@/types/profile'

interface Friendship {
  id: number
  friender: string
  friend: string
}

export function useFriendship(
  currentUserId: Ref<string | null | undefined>,
  profileId: ComputedRef<string | null | undefined>,
  isOwnProfile: ComputedRef<boolean>,
  isLoggedIn: ComputedRef<boolean>,
) {
  const supabase = useSupabaseClient<Database>()

  const friendshipStatus = ref<ProfileFriendshipStatus>('none')
  const sentFriendshipId = ref<number | null>(null)
  const receivedFriendshipId = ref<number | null>(null)

  const allFriendships = ref<Friendship[]>([])
  const friendsLoading = ref(true)

  // Friends: both sides have a row pointing at each other
  const friends = computed<string[]>(() => {
    const pid = profileId.value
    if (pid == null)
      return []

    const sentByProfile = allFriendships.value.filter(f => f.friender === pid)
    const receivedByProfile = allFriendships.value.filter(f => f.friend === pid)

    const mutual: string[] = []
    for (const sent of sentByProfile) {
      if (receivedByProfile.some(r => r.friender === sent.friend))
        mutual.push(sent.friend)
    }
    return mutual
  })

  // Requests sent by the profile that have not been accepted
  const sentRequests = computed<string[]>(() => {
    const pid = profileId.value
    if (pid == null)
      return []

    const sentByProfile = allFriendships.value.filter(f => f.friender === pid)
    const receivedByProfile = allFriendships.value.filter(f => f.friend === pid)

    return sentByProfile
      .filter(sent => !receivedByProfile.some(r => r.friender === sent.friend))
      .map(sent => sent.friend)
  })

  // Requests received by the profile that have not been accepted
  const incomingRequests = computed<string[]>(() => {
    const pid = profileId.value
    if (pid == null)
      return []

    const sentByProfile = allFriendships.value.filter(f => f.friender === pid)
    const receivedByProfile = allFriendships.value.filter(f => f.friend === pid)

    return receivedByProfile
      .filter(received => !sentByProfile.some(s => s.friend === received.friender))
      .map(received => received.friender)
  })

  async function checkFriendshipStatus() {
    const uid = currentUserId.value
    const pid = profileId.value

    if (!isLoggedIn.value || pid == null || isOwnProfile.value) {
      friendshipStatus.value = 'none'
      return
    }

    friendshipStatus.value = 'loading'

    try {
      const { data: friendships, error } = await supabase
        .from('friends')
        .select('id, friender, friend')
        .or(`and(friender.eq.${uid},friend.eq.${pid}),and(friender.eq.${pid},friend.eq.${uid})`)

      if (error != null && error.code !== 'PGRST116') {
        console.error('Error checking friendship status:', error)
        friendshipStatus.value = 'none'
        return
      }

      if (friendships == null || friendships.length === 0) {
        friendshipStatus.value = 'none'
        sentFriendshipId.value = null
        receivedFriendshipId.value = null
        return
      }

      const sentByCurrentUser = friendships.find(f => f.friender === uid && f.friend === pid)
      const sentByOtherUser = friendships.find(f => f.friender === pid && f.friend === uid)

      if (sentByCurrentUser != null && sentByOtherUser != null) {
        friendshipStatus.value = 'mutual'
        sentFriendshipId.value = sentByCurrentUser.id
        receivedFriendshipId.value = sentByOtherUser.id
      }
      else if (sentByCurrentUser != null) {
        friendshipStatus.value = 'sent_request'
        sentFriendshipId.value = sentByCurrentUser.id
        receivedFriendshipId.value = null
      }
      else if (sentByOtherUser != null) {
        friendshipStatus.value = 'received_request'
        sentFriendshipId.value = null
        receivedFriendshipId.value = sentByOtherUser.id
      }
      else {
        friendshipStatus.value = 'none'
        sentFriendshipId.value = null
        receivedFriendshipId.value = null
      }
    }
    catch (error) {
      console.error('Error checking friendship status:', error)
      friendshipStatus.value = 'none'
    }
  }

  async function fetchAllFriendships() {
    const pid = profileId.value
    if (pid == null) {
      friendsLoading.value = false
      return
    }

    friendsLoading.value = true

    try {
      const { data: friendships, error } = await supabase
        .from('friends')
        .select('id, friender, friend')
        .or(`friender.eq.${pid},friend.eq.${pid}`)

      if (error != null) {
        console.error('Error fetching friendships:', error)
        return
      }

      allFriendships.value = friendships ?? []
    }
    catch (error) {
      console.error('Error fetching friendships:', error)
    }
    finally {
      friendsLoading.value = false
    }
  }

  async function sendFriendRequest() {
    const pid = profileId.value
    const uid = currentUserId.value
    if (!isLoggedIn.value || pid == null || uid == null || isOwnProfile.value)
      return

    friendshipStatus.value = 'loading'

    try {
      const { error } = await supabase
        .from('friends')
        .insert({ friender: uid, friend: pid })

      if (error != null) {
        console.error('Error sending friend request:', error)
        friendshipStatus.value = 'none'
        return
      }

      await checkFriendshipStatus()
    }
    catch (error) {
      console.error('Error sending friend request:', error)
      friendshipStatus.value = 'none'
    }
  }

  async function acceptFriendRequest() {
    const pid = profileId.value
    const uid = currentUserId.value
    if (!isLoggedIn.value || pid == null || uid == null || isOwnProfile.value)
      return

    friendshipStatus.value = 'loading'

    try {
      const { error } = await supabase
        .from('friends')
        .insert({ friender: uid, friend: pid })

      if (error != null) {
        console.error('Error accepting friend request:', error)
        await checkFriendshipStatus()
        return
      }

      await checkFriendshipStatus()
    }
    catch (error) {
      console.error('Error accepting friend request:', error)
      await checkFriendshipStatus()
    }
  }

  async function revokeFriendRequest() {
    const pid = profileId.value
    if (!isLoggedIn.value || pid == null || sentFriendshipId.value == null)
      return

    friendshipStatus.value = 'loading'

    try {
      const { error } = await supabase
        .from('friends')
        .delete()
        .eq('id', sentFriendshipId.value)

      if (error != null) {
        console.error('Error revoking friend request:', error)
        await checkFriendshipStatus()
        return
      }

      await checkFriendshipStatus()
    }
    catch (error) {
      console.error('Error revoking friend request:', error)
      await checkFriendshipStatus()
    }
  }

  async function removeFriend() {
    const pid = profileId.value
    if (!isLoggedIn.value || pid == null)
      return

    friendshipStatus.value = 'loading'

    try {
      if (sentFriendshipId.value != null) {
        const { error } = await supabase
          .from('friends')
          .delete()
          .eq('id', sentFriendshipId.value)

        if (error != null) {
          console.error('Error removing sent friendship:', error.message)
          await checkFriendshipStatus()
          return
        }
      }

      if (receivedFriendshipId.value != null) {
        const { error } = await supabase
          .from('friends')
          .delete()
          .eq('id', receivedFriendshipId.value)

        if (error != null) {
          console.error('Error removing received friendship:', error.message)
          await checkFriendshipStatus()
          return
        }
      }

      friendshipStatus.value = 'none'
      sentFriendshipId.value = null
      receivedFriendshipId.value = null
    }
    catch (error) {
      console.error('Error removing friendship:', error)
      await checkFriendshipStatus()
    }
  }

  async function ignoreFriendRequest() {
    const pid = profileId.value
    if (!isLoggedIn.value || pid == null || receivedFriendshipId.value == null)
      return

    friendshipStatus.value = 'loading'

    try {
      const { error } = await supabase
        .from('friends')
        .delete()
        .eq('id', receivedFriendshipId.value)

      if (error != null) {
        console.error('Error ignoring friend request:', error)
        await checkFriendshipStatus()
        return
      }

      friendshipStatus.value = 'none'
      receivedFriendshipId.value = null
    }
    catch (error) {
      console.error('Error ignoring friend request:', error)
      await checkFriendshipStatus()
    }
  }

  return {
    friendshipStatus,
    sentFriendshipId,
    receivedFriendshipId,
    allFriendships,
    friendsLoading,
    friends,
    sentRequests,
    incomingRequests,
    checkFriendshipStatus,
    fetchAllFriendships,
    sendFriendRequest,
    acceptFriendRequest,
    revokeFriendRequest,
    removeFriend,
    ignoreFriendRequest,
  }
}
