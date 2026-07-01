<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Button, Dropdown, DropdownItem, Flex } from '@dolanske/vui'
import Discussion from '@/components/Discussions/Discussion.vue'
import CreateEventModal from '@/components/Events/CreateEventModal.vue'
import EventHeader from '@/components/Events/EventHeader.vue'
import EventMarkdown from '@/components/Events/EventMarkdown.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import DetailStates from '@/components/Shared/DetailStates.vue'
import { useAuthRedirect } from '@/composables/useAuthRedirect'
import { useCachedFetch } from '@/composables/useCache'
import { useDataForumUnread } from '@/composables/useDataForumUnread'
import { useDataGames } from '@/composables/useDataGames'
import { useDiscussionCache } from '@/composables/useDiscussionCache'
import { useEffectiveRole } from '@/composables/useEffectiveRole'
import { useEventTiming } from '@/composables/useEventTiming'
import { useSessionReady } from '@/composables/useSessionReady'
import { useBreakpoint } from '@/lib/mediaQuery'
import { expandRecurringEvent, nextOccurrenceDate } from '@/lib/utils/rrule'

const isMobile = useBreakpoint('<s')

// Get route parameter
const route = useRoute()
const eventId = Number.parseInt(route.params.id as string)

// Supabase client
const supabase = useSupabaseClient()

// Games from shared cache
const { getByIds } = useDataGames()

// Fetch event with caching
const { data: event, loading, error, refetch: refetchEvent } = useCachedFetch<Tables<'events'>>(
  () => ({
    table: 'events',
    select: '*',
    filters: { id: eventId },
    single: true,
  }),
  { ttl: 60000 },
)

// Derive event games from the cached list
const games = computed(() => event.value?.games ? getByIds(event.value.games as number[]) : [])

defineOgImage('Event', {
  eventId,
})

const mutableEvent = computed(() => event.value as Tables<'events'> | null)

// For recurring series, timing should reflect the next upcoming occurrence
// (for countdown) or the last occurrence (for timeAgo), not the stored origin.
const effectiveEventForTiming = computed(() => {
  const ev = mutableEvent.value
  if (!ev || !ev.recurrence_rule)
    return ev

  // If there's a next occurrence coming up, show countdown to it.
  const next = nextOccurrenceDate(ev)
  if (next)
    return { ...ev, date: next.toISOString() }

  // No next occurrence - series ended. Find the last past occurrence so
  // timeAgo is relative to when it actually last ran, not the origin date.
  const now = new Date()
  const past = expandRecurringEvent(ev, new Date(ev.date), now)
  if (past.length > 0) {
    const last = past[past.length - 1]!
    return { ...ev, date: last.date }
  }

  return ev
})

const { isUpcoming, isOngoing, timeAgo, countdown } = useEventTiming(effectiveEventForTiming)
const forumUnread = useDataForumUnread()

// Fetch the associated discussion to show reactions
const discussionCache = useDiscussionCache()
const associatedDiscussion = ref<import('@/types/database.overrides').Tables<'discussions'> | null>(null)
watch(
  () => event.value?.id,
  async (id) => {
    if (!id)
      return
    associatedDiscussion.value = await discussionCache.fetchByEntity('event', String(id))
  },
  { immediate: true },
)

function handleReplySubmitted(newReplyCount: number, discussionId: string) {
  forumUnread.markDiscussionSeen(discussionId, newReplyCount)
}

// Auth state - resolved on mount to avoid race conditions on hard reload
// (useSupabaseUser starts as null while the session is still being restored)
const { waitForSessionReady } = useSessionReady()
const { navigateToSignIn } = useAuthRedirect()
const authReady = ref(false)
const sessionUser = ref<import('@supabase/supabase-js').User | null>(null)

onMounted(async () => {
  await waitForSessionReady()
  const result = await supabase.auth.getSession().catch(() => null)
  sessionUser.value = result?.data?.session?.user ?? null
  authReady.value = true
})

// Edit permissions
const userId = useUserId()
const { isAdminOrMod: isPrivileged } = useEffectiveRole()

// True once auth has settled; uses both the reactive user and the resolved
// session to avoid false negatives during the session-restore window.
const isAuthenticated = computed(() => !!(userId.value ?? sessionUser.value))

// Matches the PostgREST "zero rows returned for .single()" error regardless
// of PostgREST version (message wording changed between versions).
function isNoRowsError(msg: string): boolean {
  return (
    msg.includes('Cannot coerce the result to a single JSON object')
    || msg.includes('JSON object requested, multiple (or no) rows returned')
  )
}

// User-friendly error message derived from the raw error and auth state.
// The "no rows" error from .single() fires for both missing events and
// events hidden by RLS from unauthenticated users.
const displayError = computed(() => {
  if (loading.value || !error.value)
    return null

  if (isNoRowsError(error.value)) {
    if (isAuthenticated.value)
      return 'This event was not found. It may have been removed or the link may be incorrect.'
    return 'This event could not be loaded. It may be a private community event - sign in to view it.'
  }

  return 'We are unable to load event details at this time. Please try again later.'
})

// Raw error shown as a copyable technical detail only for unexpected errors,
// not for the common "not found" / RLS-block case.
const displayErrorDetail = computed(() => {
  if (!error.value)
    return undefined
  if (isNoRowsError(error.value))
    return undefined
  return error.value
})

// Redirect unauthenticated users to sign-in when an event can't be loaded -
// it is likely hidden by RLS (community/private event). After signing in they
// are returned here; if the event still isn't found they see the not-found
// message above.
watch(
  [error, userId, authReady, sessionUser],
  ([eventError, , isAuthReady]) => {
    if (!isAuthReady)
      return
    if (!eventError)
      return

    if (!isAuthenticated.value && isNoRowsError(eventError))
      navigateToSignIn()
  },
  { immediate: true },
)

const canEdit = computed(() => {
  if (!event.value || !userId.value)
    return false
  const isOwner = event.value.created_by === userId.value && !event.value.is_official
  return isOwner || isPrivileged.value
})

const showEditModal = ref(false)

// Delete
const deleteLoading = ref(false)
const deleteConfirm = ref(false)

async function handleDelete() {
  if (!event.value)
    return

  deleteLoading.value = true

  try {
    const { error: deleteError } = await supabase
      .from('events')
      .delete()
      .eq('id', eventId)

    if (deleteError)
      throw deleteError

    await navigateTo('/events')
  }
  catch {
    deleteLoading.value = false
    deleteConfirm.value = false
  }
}

// Fetch minimal event data at SSR/prerender time so meta tags are populated.
// The full interactive fetch (useCachedFetch) is client-only, so during
// prerendering event.value stays null and every card falls back to
// "Event Details" / "Event details" - the doubled label crawlers were seeing.
const { data: seoEvent } = await useAsyncData(`event-seo-${eventId}`, async () => {
  const { data } = await supabase
    .from('events')
    .select('title, description')
    .eq('id', eventId)
    .maybeSingle()
  return data
})

const seoTitle = computed(() => {
  const source = event.value ?? seoEvent.value
  return source?.title ? `${source.title} | Events` : 'Event Details'
})

const seoDescription = computed(() => {
  const source = event.value ?? seoEvent.value
  return source?.description || 'Event details'
})

// SEO and page metadata
useSeoMeta({
  title: seoTitle,
  description: seoDescription,
  ogTitle: seoTitle,
  ogDescription: seoDescription,
})

// Page title
useHead({
  title: computed(() => (event.value ?? seoEvent.value)?.title ?? 'Event Details'),
})
</script>

<template>
  <div class="page">
    <div :class="!isMobile && 'container-m'">
      <ClientOnly>
        <!-- Loading and Error States -->
        <DetailStates
          :loading="loading"
          :error="displayError"
          back-to="/events"
          back-label="Events"
          :error-message="displayErrorDetail"
        />

        <!-- Event Content -->
        <Flex
          v-if="event && !loading && !error" column gap="l" expand
        >
          <!-- Back Button -->
          <Flex x-between y-center expand>
            <NuxtLink to="/events">
              <Button
                variant="gray"
                plain
                size="s"
                aria-label="Go back to Events page"
                class="event-detail__back-link"
              >
                <template #start>
                  <Icon name="ph:arrow-left" />
                </template>
                Back to Events
              </Button>
            </NuxtLink>

            <Dropdown v-if="canEdit">
              <template #trigger="{ toggle }">
                <Button variant="gray" size="s" @click="toggle">
                  Manage
                </Button>
              </template>
              <DropdownItem @click="showEditModal = true">
                Edit
              </DropdownItem>
              <DropdownItem variant="danger" @click="deleteConfirm = true">
                Delete
              </DropdownItem>
            </Dropdown>
          </Flex>

          <!-- Header -->
          <Flex expand column :class="{ 'event-ongoing': isOngoing }">
            <EventHeader
              :event="effectiveEventForTiming!"
              :games="games"
              :discussion-id="associatedDiscussion?.id ?? null"
              :discussion-reactions="associatedDiscussion?.reactions"
              :is-upcoming="isUpcoming"
              :is-ongoing="isOngoing"
              :countdown="countdown"
              :time-ago="timeAgo"
            />
          </Flex>

          <Flex column expand>
            <!-- Markdown -->
            <EventMarkdown :event="mutableEvent!" />

            <!-- Related discussion -->
            <Discussion
              :id="String(event.id)"
              class="event-discussion"
              type="event"
              @reply-submitted="handleReplySubmitted"
            />
          </Flex>
        </Flex>

        <CreateEventModal v-model:open="showEditModal" :event="mutableEvent" @saved="refetchEvent" />

        <ConfirmModal
          v-if="event"
          v-model:open="deleteConfirm"
          :confirm-loading="deleteLoading"
          title="Delete event"
          :description="`Are you sure you want to delete '${event.title}'? This cannot be undone.`"
          confirm-text="Delete"
          :destructive="true"
          @confirm="handleDelete"
        />
      </ClientOnly>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* .event-discussion {
  max-width: 728px;
} */
</style>
