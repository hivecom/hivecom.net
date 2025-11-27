<script setup lang="ts">
import type { Database } from '@/types/database.types'
import { Button, Dropdown, DropdownTitle, Flex, Spinner, Tooltip } from '@dolanske/vui'
import NotificationCard from '@/components/Layout/NotificationCard.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'

const supabase = useSupabaseClient<Database>()
const user = useSupabaseUser()
const userId = useUserId()

const loading = ref(false)
const error = ref<string | null>(null)
const friendships = ref<Array<{ id: number, friender: string, friend: string }>>([])
const profileMeta = ref<{ birthday: string | null, username: string } | null>(null)
const inviteActionLoading = ref<Record<string, boolean>>({})

const hasUser = computed(() => Boolean(user.value && userId.value))

async function fetchNotifications() {
  if (!hasUser.value) {
    friendships.value = []
    profileMeta.value = null
    inviteActionLoading.value = {}
    loading.value = false
    error.value = null
    return
  }

  loading.value = true
  error.value = null

  try {
    const [friendsResponse, profileResponse] = await Promise.all([
      supabase
        .from('friends')
        .select('id, friender, friend')
        .or(`friender.eq.${userId.value},friend.eq.${userId.value}`),
      supabase
        .from('profiles')
        .select('id, username, birthday')
        .eq('id', userId.value as string)
        .single(),
    ])

    if (friendsResponse.error)
      throw friendsResponse.error
    if (profileResponse.error)
      throw profileResponse.error

    friendships.value = friendsResponse.data ?? []
    profileMeta.value = profileResponse.data
      ? { birthday: profileResponse.data.birthday, username: profileResponse.data.username }
      : null
    inviteActionLoading.value = {}
  }
  catch (err) {
    console.error('Failed to load notification data', err)
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
  return inviteCount + birthdayCount
})

const badgeText = computed(() => {
  if (notificationCount.value > 99)
    return '99+'
  if (notificationCount.value > 0)
    return notificationCount.value.toString()
  return ''
})

const showEmptyCard = computed(() => {
  return !loading.value && !error.value && pendingRequestIds.value.length === 0 && !birthdayWidget.value
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
    <Dropdown min-width="360px" placement="bottom-end">
      <template #trigger="{ toggle }">
        <button class="notification-menu__trigger" aria-label="Open notifications" @click="toggle">
          <Icon name="ph:bell" />
          <span v-if="badgeText" class="notification-menu__badge">{{ badgeText }}</span>
        </button>
      </template>

      <div class="notification-menu__panel">
        <DropdownTitle>
          <div class="notification-menu__title-row">
            <p class="notification-menu__title">
              Notifications
            </p>
            <button
              class="notification-menu__refresh"
              type="button"
              aria-label="Refresh notifications"
              :disabled="loading"
              @click="fetchNotifications"
            >
              <Icon name="ph:arrows-clockwise" />
            </button>
          </div>
        </DropdownTitle>

        <div class="notification-menu__body">
          <template v-if="loading">
            <NotificationCard
              v-for="index in 2"
              :key="`loading-${index}`"
              text="Loading updates"
              icon="ph:bell"
            >
              <Flex gap="s" y-center>
                <Spinner size="s" />
              </Flex>
            </NotificationCard>
          </template>

          <template v-else>
            <NotificationCard
              v-if="error"
              to="/profile"
              text="Unable to refresh"
              icon="ph:warning-circle"
            >
              <template #actions>
                <Button size="s" variant="gray" @click="fetchNotifications">
                  Retry
                </Button>
              </template>
            </NotificationCard>

            <NotificationCard
              v-for="requestId in pendingRequestIds"
              :key="`invite-${requestId}`"
              icon="ph:user-plus"
            >
              <Flex class="w-full" x-end>
                <UserDisplay :user-id="requestId" size="s" />
              </Flex>
              <template #actions>
                <Tooltip placement="top">
                  <Button
                    square
                    size="s"
                    variant="gray"
                    :loading="isInviteLoading(requestId)"
                    aria-label="Ignore invite"
                    @click="handleInviteAction(requestId, 'ignore')"
                  >
                    <Icon name="ph:x" />
                  </Button>
                  <template #tooltip>
                    <p>Ignore invite</p>
                  </template>
                </Tooltip>
                <Tooltip placement="top">
                  <Button
                    square
                    size="s"
                    variant="accent"
                    :loading="isInviteLoading(requestId)"
                    aria-label="Accept invite"
                    @click="handleInviteAction(requestId, 'accept')"
                  >
                    <Icon name="ph:check" />
                  </Button>
                  <template #tooltip>
                    <p>Accept invite</p>
                  </template>
                </Tooltip>
              </template>
            </NotificationCard>

            <NotificationCard
              v-if="birthdayWidget"
              :text="birthdayWidget.title"
              icon="ph:cake"
              to="/profile"
              shiny
            />

            <NotificationCard
              v-if="showEmptyCard"
              text="All caught up"
              icon="ph:smiley"
            />
          </template>
        </div>
      </div>
    </Dropdown>
  </div>
</template>

<style lang="scss" scoped>
.notification-menu {
  position: relative;

  :deep(.vui-dropdown-title) {
    text-transform: none;
  }

  &__trigger {
    position: relative;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    border: none;
    background: color-mix(in srgb, var(--color-bg-lowered) 60%, transparent);
    color: var(--color-text);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.2s ease;

    &:hover {
      background: color-mix(in srgb, var(--color-bg-lowered) 80%, transparent);
    }
  }

  &__badge {
    position: absolute;
    top: 8px;
    right: 8px;
    background: var(--color-accent);
    color: var(--color-text-on-accent);
    font-size: 4px;
    line-height: 1;
    min-width: 10px;
    height: 10px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__panel {
    min-width: 300px;
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
    margin-top: var(--space-xs);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  &__refresh {
    background: none;
    border: none;
    padding: 4px;
    border-radius: var(--border-radius-s);
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition:
      color 0.15s ease,
      background-color 0.15s ease;

    &:hover:not(:disabled) {
      color: var(--color-text);
      background: color-mix(in srgb, var(--color-bg-lowered) 70%, transparent);
    }

    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
  }
}
</style>
