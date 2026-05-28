<script setup lang="ts">
import { Button, Card, Flex, Grid, Skeleton } from '@dolanske/vui'
import CommunityBirthdays from '@/components/Community/CommunityBirthdays.vue'
import FundingProgress from '@/components/Community/FundingProgress.vue'
import GameMarquee from '@/components/Community/Games/GameMarquee.vue'
import ProjectCard from '@/components/Community/ProjectCard.vue'
import SupportCTA from '@/components/Community/SupportCTA.vue'
import BulkAvatarDisplay from '@/components/Shared/BulkAvatarDisplay.vue'
import ChartOnlineUsersModal from '@/components/Shared/Charts/ChartOnlineUsersModal.vue'
import GlowGroup from '@/components/Shared/GlowGroup.vue'
import OnlineBadge from '@/components/Shared/OnlineBadge.vue'
import { useCache } from '@/composables/useCache'
import { useDataGames } from '@/composables/useDataGames'
import { useDataMetrics } from '@/composables/useDataMetrics'
import { useDataProjects } from '@/composables/useDataProjects'
import { patchProfileLastSeen } from '@/composables/useDataUser'
import { isBanActive } from '@/lib/banStatus'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'
import { useBreakpoint } from '@/lib/mediaQuery'
import { getBirthdayPatterns } from '@/lib/utils/date'
import { shuffleArray } from '@/lib/utils/random'

const isMobile = useBreakpoint('<xs')

// Get current user for authentication checks
const user = useSupabaseUser()
const supabase = useSupabaseClient()
const route = useRoute()

const queryTab = computed(() => {
  const tab = route.query.tab ?? (route.query.voice ? 'voice' : undefined)
  return Array.isArray(tab) ? tab[0] : tab
})

if (queryTab.value === 'voice') {
  await navigateTo('/servers/voiceservers', { redirectCode: 301 })
}

useSeoMeta({
  title: 'Community',
  description: 'Learn about Hivecom, explore community projects, and connect with users.',
  ogTitle: 'Community',
  ogDescription: 'Learn about Hivecom, explore community projects, and connect with users.',
})

defineOgImage('Default', {
  title: 'Community',
  description: 'Learn about Hivecom, explore community projects, and connect with users.',
})

// State for community members - hoist cache check before loading so it initializes correctly
const { projects: allProjects } = useDataProjects()
const { games } = useDataGames()
const marqueeGames = computed(() => [...games.value].sort(() => Math.random() - 0.5).slice(0, 60))
const communityCache = useCache(CACHE_NAMESPACES.community)

const COMMUNITY_MEMBERS_CACHE_KEY = 'community-page:members'
const COMMUNITY_MEMBERS_TTL = 5 * 60 * 1000 // 5 minutes

interface CommunityMembersCache {
  randomUsers: string[]
  supporters: string[]
  birthdayUserIds: string[]
}

const _cachedMembers = communityCache.get<CommunityMembersCache>(COMMUNITY_MEMBERS_CACHE_KEY)

const randomUsers = ref<string[]>(_cachedMembers?.randomUsers ?? [])
const supporters = ref<string[]>(_cachedMembers?.supporters ?? [])
const birthdayUserIds = ref<string[]>(_cachedMembers?.birthdayUserIds ?? [])
const loading = ref(_cachedMembers === null)
const showOnlineModal = ref(false)
const error = ref('')

const ONLINE_THRESHOLD_MS = 15 * 60 * 1000
const ONLINE_USERS_CACHE_KEY = 'community-page:online-users'
const ONLINE_USERS_TTL = 60 * 1000 // 1 minute
const onlineUserIds = ref<string[]>([])
const onlineUsersLoading = ref(false)

async function fetchOnlineUsers() {
  const cached = communityCache.get<string[]>(ONLINE_USERS_CACHE_KEY)
  if (cached) {
    onlineUserIds.value = cached
    return
  }
  onlineUsersLoading.value = true
  const threshold = new Date(Date.now() - ONLINE_THRESHOLD_MS).toISOString()
  const { data } = await supabase
    .from('profiles')
    .select('id, last_seen')
    .gt('last_seen', threshold)
    .order('last_seen', { ascending: false })
    .limit(100)
  const rows = data ?? []
  const ids = rows.map(p => p.id)
  onlineUserIds.value = ids
  communityCache.set(ONLINE_USERS_CACHE_KEY, ids, ONLINE_USERS_TTL)
  for (const row of rows) {
    if (row.last_seen)
      patchProfileLastSeen(row.id, row.last_seen)
  }
  onlineUsersLoading.value = false
}

watch(showOnlineModal, (open) => {
  if (open)
    void fetchOnlineUsers()
})

const { latestMetrics, fetchLatestMetrics } = useDataMetrics()
const onlineCount = computed(() => onlineUserIds.value.length > 0 ? onlineUserIds.value.length : (latestMetrics.value?.users.online ?? null))
fetchLatestMetrics()
void fetchOnlineUsers()

// State for recent projects
const recentProjects = ref<ReturnType<typeof useDataProjects>['projects']['value']>([])

// Pre-populate recent projects synchronously from already-cached project list
if (allProjects.value.length > 0)
  recentProjects.value = shuffleArray([...allProjects.value]).slice(0, 3)

interface SupporterProfile {
  id: string
  supporter_lifetime: boolean | null
  supporter_patreon: boolean | null
  banned: boolean | null
  ban_end: string | null
}

const MAX_RANDOM_COMMUNITY_MEMBERS = 50

function buildActiveProfileFilter(timestamp: string) {
  return `banned.eq.false,ban_end.lte.${timestamp}`
}

async function fetchRandomActiveCommunityMembers(filterClause: string) {
  try {
    const { count, error: countError } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .or(filterClause)

    if (countError) {
      console.warn('Error counting community members:', countError)
      return []
    }

    const totalEligible = count ?? 0

    if (totalEligible === 0)
      return []

    const fetchSize = Math.min(totalEligible, MAX_RANDOM_COMMUNITY_MEMBERS)
    const maxOffset = Math.max(totalEligible - fetchSize, 0)
    const randomOffset = maxOffset > 0 ? Math.floor(Math.random() * (maxOffset + 1)) : 0

    const { data, error: rangeError } = await supabase
      .from('profiles')
      .select('id')
      .or(filterClause)
      .range(randomOffset, randomOffset + fetchSize - 1)

    if (rangeError) {
      console.warn('Error fetching random community members:', rangeError)
      return []
    }

    return ((data ?? []) as Array<{ id: string }>)
      .map(({ id }) => ({ id, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map(entry => entry.id)
      .slice(0, MAX_RANDOM_COMMUNITY_MEMBERS)
  }
  catch (error) {
    console.warn('Unexpected error fetching random community members:', error)
    return []
  }
}

// Fetch community data
async function fetchCommunityData() {
  try {
    // Warm cache - pre-population already handled at setup time, nothing to do
    if (_cachedMembers !== null && recentProjects.value.length > 0)
      return

    // Only show loading skeleton on cold load - cache pre-population handles warm visits
    if (_cachedMembers === null)
      loading.value = true
    error.value = ''

    if (user.value) {
      const nowIso = new Date().toISOString()
      const activeProfilesFilter = buildActiveProfileFilter(nowIso)

      // Compute MM-DD patterns covering +/-12h of now (handles all timezones)
      const birthdayPatterns = getBirthdayPatterns()

      // Fetch supporters, random users, and birthday users in parallel for authenticated users
      const [supportersResult, randomUserIds, birthdayResult] = await Promise.all([
        // Fetch supporters (lifetime and patreon)
        supabase
          .from('profiles')
          .select('id, supporter_lifetime, supporter_patreon, banned, ban_end')
          .or('supporter_lifetime.eq.true,supporter_patreon.eq.true')
          .order('created_at', { ascending: true }), // Show earliest supporters first

        // Fetch random selection of users
        fetchRandomActiveCommunityMembers(activeProfilesFilter),

        // Fetch all profiles with a birthday set - we filter MM-DD client-side because
        // the birthday column is a date type and PostgREST cannot apply LIKE to it directly.
        supabase
          .from('profiles')
          .select('id, birthday, banned, ban_end')
          .not('birthday', 'is', null),
      ])

      if (supportersResult.error) {
        console.warn('Error fetching supporters:', supportersResult.error)
      }
      else if (supportersResult.data) {
        const supporterRows = supportersResult.data as SupporterProfile[]
        supporters.value = supporterRows
          .filter(profile => !isBanActive(profile.banned, profile.ban_end))
          .map(profile => profile.id)
      }

      if (birthdayResult.error) {
        console.warn('Error fetching birthday users:', birthdayResult.error)
      }
      else if (birthdayResult.data) {
        // Supabase returns date columns as 'YYYY-MM-DD' strings, so slice(5) gives 'MM-DD'
        const birthdayRows = birthdayResult.data as Array<{ id: string, birthday: string | null, banned: boolean | null, ban_end: string | null }>
        birthdayUserIds.value = birthdayRows
          .filter(p => !isBanActive(p.banned, p.ban_end) && p.birthday != null && birthdayPatterns.includes(p.birthday.slice(5)))
          .map(p => p.id)
      }

      // Exclude birthday celebrants from the random members cluster so they don't appear twice
      randomUsers.value = randomUserIds.filter(id => !birthdayUserIds.value.includes(id))

      // Cache the member data for warm re-visits
      communityCache.set<CommunityMembersCache>(COMMUNITY_MEMBERS_CACHE_KEY, {
        randomUsers: randomUsers.value,
        supporters: supporters.value,
        birthdayUserIds: birthdayUserIds.value,
      }, COMMUNITY_MEMBERS_TTL)
    }

    // Pick 3 random projects from the cached list (works for both auth states)
    recentProjects.value = shuffleArray([...allProjects.value]).slice(0, 3)
  }
  catch (err) {
    console.error('Error fetching community data:', err)
    error.value = err instanceof Error ? err.message : 'Failed to load community data'
  }
  finally {
    loading.value = false
  }
}

// Load data when user is authenticated or on initial load
watch(user, () => {
  fetchCommunityData()
}, { immediate: true })
</script>

<template>
  <div class="page container-l">
    <!-- Hero section -->
    <!-- <section class="page-title">
      <h1>Community</h1>
      <p>Friends building things together</p>
    </section> -->

    <!-- Community Users (includes birthday sub-section when applicable) -->
    <ClientOnly>
      <ChartOnlineUsersModal
        v-model:open="showOnlineModal"
        :online-user-ids="onlineUserIds"
        :online-users-loading="onlineUsersLoading"
        :online-count="onlineCount"
      />

      <Skeleton v-if="loading" :height="376" :radius="8" class="mt-l mb-l" style="display: block;" />

      <Card v-else-if="user && !loading && (randomUsers.length > 0 || birthdayUserIds.length > 0)" :padding="false" class="pb-l mt-l community-card">
        <Flex column gap="l" x-center y-center>
          <Flex y-center gap="m" x-center expand>
            <Flex column :gap="0" x-center class="text-center" y-center>
              <h1 class="text-bold text-xxxxl">
                Community
              </h1>
              <p class="text-color-light">
                One of many and many of one
              </p>
            </Flex>
          </Flex>
          <BulkAvatarDisplay
            v-if="randomUsers.length > 0"
            :user-ids="randomUsers"
            :max-users="48"
            :avatar-size="64"
            :gap="12"
            :supporter-highlight="true"
            show-online-indicator
            cluster
          />
          <OnlineBadge :count="onlineCount" clickable @click="showOnlineModal = true" />
          <CommunityBirthdays
            v-if="birthdayUserIds.length > 0"
            :user-ids="birthdayUserIds"
            :show-divider="randomUsers.length > 0"
          />
        </Flex>
      </Card>

      <!-- Sign-in prompt for community features -->
      <section v-else class="mt-m mb-l">
        <Card class="signin-prompt">
          <Flex column gap="l" y-center class="signin-prompt__content">
            <div class="signin-prompt__icon">
              <Icon name="ph:users-three" size="5rem" />
            </div>
            <h3 class="text-bold text-xxl">
              Discover Our Community
            </h3>
            <p class="text-color-light text-center">
              Sign in to see our supporters and meet our community from around the world
            </p>
            <NuxtLink to="/auth/sign-in">
              <Button variant="accent">
                <template #start>
                  <Icon name="ph:sign-in" />
                </template>
                Sign In
              </Button>
            </NuxtLink>
          </Flex>
        </Card>
      </section>

      <!-- What We Play -->
      <section v-if="marqueeGames.length > 0">
        <Flex x-between y-center class="mb-s">
          <Flex column gap="xxs">
            <h3 class="section-title">
              What We Play
            </h3>
            <p class="section-subtitle">
              Maybe there's something in here for you too
            </p>
          </Flex>
          <NuxtLink to="/community/games">
            <Button size="s" outline>
              All Game Activity
              <template #end>
                <Icon name="ph:arrow-right" />
              </template>
            </Button>
          </NuxtLink>
        </Flex>
        <GameMarquee :games="marqueeGames" :interactive="false" draggable @click="navigateTo('/community/games')" />
      </section>

      <!-- Recent Projects -->
      <section v-if="recentProjects.length > 0 || loading" class="mt-xl">
        <Flex column gap="l">
          <Flex :y-end="!isMobile" :x-between="!isMobile" :column="isMobile" expand>
            <Flex gap="xxs" column>
              <h3 class="section-title">
                Projects
              </h3>
              <p class="section-subtitle">
                Discover what our community has been building
              </p>
            </Flex>
            <NuxtLink to="/community/projects" :class="isMobile ? 'w-100' : ''">
              <Button :expand="isMobile" size="s" outline>
                <template #end>
                  <Icon name="ph:arrow-right" />
                </template>
                All Projects
              </Button>
            </NuxtLink>
          </Flex>

          <GlowGroup>
            <Grid :columns="3" gap="m" class="projects-grid" expand>
              <template v-if="loading">
                <Skeleton v-for="i in 3" :key="i" :height="260" :radius="8" />
              </template>
              <template v-else>
                <ProjectCard
                  v-for="project in recentProjects"
                  :key="project.id"
                  :project="project"
                  compact
                />
              </template>
            </Grid>
          </GlowGroup>
        </Flex>
      </section>

      <!-- Monthly Funding Progress -->
      <Flex column gap="l" class="mt-xl">
        <Flex gap="xxs" column>
          <h3 class="section-title">
            Funding
          </h3>
          <p class="section-subtitle">
            See how we're doing this month and how you can help support our community
          </p>
        </Flex>
        <FundingProgress />
      </Flex>

      <!-- Support Section with Community Supporters -->
      <section class="mt-l">
        <SupportCTA :supporter-ids="supporters" />
      </section>
    </ClientOnly>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/breakpoints.scss' as *;

.community-card {
  border: none;
  position: relative;
  overflow: hidden;
}

.signin-prompt {
  min-height: 376px;
  border: 2px dashed var(--color-border);
  text-align: center;

  &__content {
    padding: var(--space-xl);
  }

  &__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 80px;
    height: 80px;
    border-radius: var(--border-radius-pill);
    background: linear-gradient(135deg, var(--color-accent-weak), var(--color-accent-alpha));
    color: var(--color-accent);
    margin: 0 auto;
  }
}

// Projects Grid Styling
.projects-grid {
  @media screen and (max-width: $breakpoint-m) {
    grid-template-columns: 1fr 1fr !important;
  }

  @media screen and (max-width: $breakpoint-s) {
    grid-template-columns: 1fr !important;
  }
}

.project-title {
  color: var(--color-text);
  font-size: var(--font-size-l);
  margin: 0;
}

.project-description {
  color: var(--color-text-light);
  flex: 1;
  margin: 0;
}

.project-github {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--border-radius-pill);
  background: var(--color-bg-accent-weak);
  color: var(--color-accent);
  transition: all 0.3s ease;

  &:hover {
    background: var(--color-accent-weak);
    color: var(--color-accent);
  }
}

.project-tag {
  display: inline-block;
  padding: var(--space-xxs) var(--space-xs);
  border-radius: var(--border-radius-s);
  background: var(--color-bg-medium);
  color: var(--color-text);
  font-size: var(--font-size-xs);
  margin-right: var(--space-xxs);
  margin-bottom: var(--space-xxs);

  &--more {
    background: var(--color-info-weak);
    color: var(--color-info);
  }
}

.project-link {
  margin-top: auto;
}
</style>
