<script setup lang="ts">
import type { Database } from '@/types/database.types'
import { Button, Flex, Popout } from '@dolanske/vui'
import NotificationCardBirthday from '@/components/Notifications/NotificationCardBirthday.vue'
import NotificationCardEmpty from '@/components/Notifications/NotificationCardEmpty.vue'
import NotificationCardError from '@/components/Notifications/NotificationCardError.vue'
import NotificationCardInvite from '@/components/Notifications/NotificationCardInvite.vue'
import NotificationCardLoading from '@/components/Notifications/NotificationCardLoading.vue'
import NotificationCardPendingComplaints from '@/components/Notifications/NotificationCardPendingComplaints.vue'

const supabase = useSupabaseClient<Database>()
const user = useSupabaseUser()
const userId = useUserId()

const loading = ref(false)
const error = ref<string | null>(null)
const friendships = ref<Array<{ id: number, friender: string, friend: string }>>([])
const profileMeta = ref<{ birthday: string | null, username: string } | null>(null)
const inviteActionLoading = ref<Record<string, boolean>>({})
const userRole = ref<Database['public']['Enums']['app_role'] | null>(null)
const pendingComplaintCount = ref(0)

const hasUser = computed(() => Boolean(user.value && userId.value))

const anchorRef = useTemplateRef('anchor')
const open = ref(false)

async function fetchNotifications() {
  if (!hasUser.value) {
    friendships.value = []
    profileMeta.value = null
    inviteActionLoading.value = {}
    userRole.value = null
    pendingComplaintCount.value = 0
    loading.value = false
    error.value = null
    return
  }

  loading.value = true
  error.value = null

  try {
    const [friendsResponse, profileResponse, roleResponse] = await Promise.all([
      supabase
        .from('friends')
        .select('id, friender, friend')
        .or(`friender.eq.${userId.value},friend.eq.${userId.value}`),
      supabase
        .from('profiles')
        .select('id, username, birthday')
        .eq('id', userId.value as string)
        .single(),
      supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId.value as string)
        .maybeSingle(),
    ])

    if (friendsResponse.error)
      throw friendsResponse.error
    if (profileResponse.error)
      throw profileResponse.error
    if (roleResponse.error)
      userRole.value = null

    friendships.value = friendsResponse.data ?? []
    profileMeta.value = profileResponse.data
      ? { birthday: profileResponse.data.birthday, username: profileResponse.data.username }
      : null
    if (!roleResponse.error)
      userRole.value = roleResponse.data?.role ?? null
    inviteActionLoading.value = {}

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

watch(hasUser, (ready) => {
  if (ready) {
    void fetchNotifications()
  }
  else {
    friendships.value = []
    profileMeta.value = null
    inviteActionLoading.value = {}
    userRole.value = null
    pendingComplaintCount.value = 0
    error.value = null
  }
}, { immediate: true })

const pendingRequestIds = computed(() => {
  if (!userId.value)
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

function parseBirthdayDate(value: string | null) {
  if (!value)
    return null

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (match) {
    const [, year, month, day] = match
    const date = new Date(Number(year), Number(month) - 1, Number(day))
    return Number.isNaN(date.getTime()) ? null : date
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const birthdayWidget = computed(() => {
  const birthdayValue = profileMeta.value?.birthday
  if (!birthdayValue)
    return null

  const parsed = parseBirthdayDate(birthdayValue)
  if (!parsed)
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

  const isToday = daysUntil === 0
  if (!isToday)
    return null

  return {
    title: 'Happy Birthday!',
    description: 'Hope you can celebrate with the community today.',
  }
})

const notificationCount = computed(() => {
  const inviteCount = pendingRequestIds.value.length
  const birthdayCount = birthdayWidget.value ? 1 : 0
  const complaintCount = pendingComplaintCount.value
  return inviteCount + birthdayCount + complaintCount
})

const badgeText = computed(() => {
  if (notificationCount.value > 99)
    return '99+'
  if (notificationCount.value > 0)
    return notificationCount.value.toString()
  return ''
})

const showEmptyCard = computed(() => {
  return !loading.value
    && !error.value
    && pendingRequestIds.value.length === 0
    && !birthdayWidget.value
    && pendingComplaintCount.value === 0
})

const loadingCardCount = computed(() => {
  if (!loading.value)
    return 0

  const inviteCount = pendingRequestIds.value.length
  const birthdayCount = birthdayWidget.value ? 1 : 0
  const complaintCount = pendingComplaintCount.value
  const total = inviteCount + birthdayCount + complaintCount
  return total > 0 ? total : 1
})

function setInviteLoading(id: string, state: boolean) {
  inviteActionLoading.value = {
    ...inviteActionLoading.value,
    [id]: state,
  }
}

function isInviteLoading(id: string) {
  return Boolean(inviteActionLoading.value[id])
}

async function handleInviteAction(requestUserId: string, action: 'accept' | 'ignore') {
  if (!userId.value)
    return

  setInviteLoading(requestUserId, true)

  try {
    if (action === 'accept') {
      await supabase
        .from('friends')
        .insert({
          friender: userId.value,
          friend: requestUserId,
        })
    }
    else {
      await supabase
        .from('friends')
        .delete()
        .match({
          friender: requestUserId,
          friend: userId.value,
        })
    }

    await fetchNotifications()
  }
  catch (err) {
    console.error('Failed to update friend request', err)
    error.value = err instanceof Error ? err.message : 'Failed to update friend request'
  }
  finally {
    setInviteLoading(requestUserId, false)
  }
}
</script>

<template>
  <div class="notification-menu" aria-live="polite">
    <Button ref="anchor" square plain aria-label="Open notifications" class="vui-button-accent-weak" @click="open = !open">
      <Icon name="ph:bell" :size="20" />
      <span v-if="badgeText" class="notification-menu__badge" />
    </Button>

    <Popout :visible="open" placement="bottom-end" :anchor="anchorRef" @click-outside="open = false">
      <Flex y-center x-between class="notification-menu__title-row">
        <p class="notification-menu__title">
          Notifications
        </p>

        <Button
          square
          size="s"
          plain
          aria-label="Refresh notifications"
          :disabled="loading"
          @click="fetchNotifications"
        >
          <Icon name="ph:arrows-clockwise" />
        </Button>
      </Flex>

      <div class="notification-menu__body">
        <template v-if="loading">
          <NotificationCardLoading
            v-for="index in loadingCardCount"
            :key="`loading-${index}`"
          />
        </template>

        <template v-else>
          <NotificationCardError v-if="error" @retry="fetchNotifications" />

          <NotificationCardInvite
            v-for="requestId in pendingRequestIds"
            :key="`invite-${requestId}`"
            :request-id="requestId"
            :loading="isInviteLoading(requestId)"
            @accept="handleInviteAction(requestId, 'accept')"
            @ignore="handleInviteAction(requestId, 'ignore')"
          />

          <NotificationCardBirthday
            v-if="birthdayWidget"
            :title="birthdayWidget.title"
            :description="birthdayWidget.description"
            to="/profile"
          />

          <NotificationCardPendingComplaints
            v-if="pendingComplaintCount > 0"
            :count="pendingComplaintCount"
            to="/admin/complaints"
          />

          <NotificationCardEmpty v-if="showEmptyCard" />
        </template>
      </div>
    </Popout>
  </div>
</template>

<style lang="scss">
@use '@/assets/breakpoints.scss' as *;

.notification-menu {
  position: relative;

  :deep(.vui-dropdown-title) {
    text-transform: none;
  }

  &__title-row {
    // border-bottom: 1px solid var(--color-border);
    padding: var(--space-xs);
  }

  &__badge {
    position: absolute;
    top: 5px;
    right: 5px;
    background: var(--color-accent);
    color: var(--color-text-on-accent);
    min-width: 10px;
    height: 10px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__title-row {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-m);
  }

  &__title {
    padding-left: var(--space-xxs);
    margin: 0;
    font-weight: var(--font-weight-semibold);
    font-size: var(--font-size-m);
  }

  &__body {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    padding: var(--space-xs);
    padding-top: 0;
    width: 328px;
  }

  @media screen and (max-width: $breakpoint-xs) {
    &__body {
      width: 292px;
    }
  }
}
</style>
