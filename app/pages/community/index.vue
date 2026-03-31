<script setup lang="ts">
import { Button, Card, Flex, Grid } from '@dolanske/vui'
import CommunityBirthdays from '@/components/Community/CommunityBirthdays.vue'
import FundingProgress from '@/components/Community/FundingProgress.vue'
import ProjectCard from '@/components/Community/ProjectCard.vue'
import SupportCTA from '@/components/Community/SupportCTA.vue'
import BulkAvatarDisplayCluster from '@/components/Shared/BulkAvatarDisplayCluster.vue'
import { useDataProjects } from '@/composables/useDataProjects'
import { isBanActive } from '@/lib/banStatus'
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

const communityLinks = [
  {
    to: '/events',
    ariaLabel: 'View upcoming community events and activities',
    icon: 'ph:calendar',
    title: 'Community Events',
    subtitle: 'Join our community events and online gatherings',
  },
  {
    to: '/community/projects',
    ariaLabel: 'Explore community projects and initiatives',
    icon: 'ph:folder',
    title: 'Community Projects',
    subtitle: 'Explore projects and initiatives from our community',
  },
  {
    to: '/community/funding',
    ariaLabel: 'View our funding transparency and financial information',
    icon: 'ph:chart-bar',
    title: 'Funding & Transparency',
    subtitle: 'See how we\'re funded and where contributions go',
  },
  {
    to: '/servers/gameservers',
    ariaLabel: 'Explore our game servers and gaming community',
    icon: 'ph:game-controller',
    title: 'Game Servers',
    subtitle: 'Connect to our hosted game servers',
  },
]

useSeoMeta({
  title: 'Community',
  description: 'Learn about Hivecom, explore community projects, and connect with members.',
  ogTitle: 'Community',
  ogDescription: 'Learn about Hivecom, explore community projects, and connect with members.',
})

defineOgImageComponent('Default', {
  title: 'Community',
  description: 'Learn about Hivecom, explore community projects, and connect with members.',
})

// State for community members
const randomUsers = ref<string[]>([])
const supporters = ref<string[]>([])
const birthdayUserIds = ref<string[]>([])
const loading = ref(true)
const error = ref('')

// State for recent projects
const recentProjects = ref<ReturnType<typeof useDataProjects>['projects']['value']>([])

const { projects: allProjects } = useDataProjects()

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
  <div class="page">
    <!-- Hero section -->
    <section class="page-title">
      <h1>Community</h1>
      <p>Friends building things together</p>
    </section>

    <!-- Community Members (includes birthday sub-section when applicable) -->
    <Card v-if="user && (randomUsers.length > 0 || birthdayUserIds.length > 0)" class="pb-l mt-l community-card">
      <Flex column gap="l" x-center y-center>
        <Flex y-center gap="m" x-center expand>
          <Flex column :gap="0" x-center class="text-center" y-center>
            <h2 class="text-bold text-xxl">
              One of Many
            </h2>
            <p class="text-color-light">
              A slice of our community from around the world
            </p>
          </Flex>
        </Flex>
        <BulkAvatarDisplayCluster
          v-if="randomUsers.length > 0"
          :user-ids="randomUsers"
          :max-users="48"
          :avatar-size="64"
          :gap="12"
          :supporter-highlight="true"
        />
        <CommunityBirthdays
          v-if="birthdayUserIds.length > 0"
          :user-ids="birthdayUserIds"
          :show-divider="randomUsers.length > 0"
        />
      </Flex>
    </Card>

    <!-- Sign-in prompt for community features -->
    <section v-if="!user" class="mt-m">
      <Card class="signin-prompt">
        <Flex column gap="m" y-center class="signin-prompt__content">
          <div class="signin-prompt__icon">
            <Icon name="ph:users-three" size="2.5rem" />
          </div>
          <h3 class="text-bold text-xl">
            Discover Our Community
          </h3>
          <p class="text-color-light text-center">
            Sign in to see our supporters and meet community members from around the world
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

    <!-- Community Overview -->
    <section class="mt-xl">
      <Grid :columns="2" gap="l" class="community-grid">
        <!-- About Our Community -->
        <Card class="community-info-card card-bg">
          <Flex column gap="m" expand>
            <Flex y-center gap="m">
              <div class="community-info-card__icon">
                <Icon name="ph:users-three" size="2rem" />
              </div>
              <h3>
                Our Community
              </h3>
            </Flex>

            <p class="about-description">
              Hivecom is a passionate community of developers, gamers, and friends who love building and sharing projects together. We host game servers, develop open-source tools, and create a welcoming space for collaboration.
            </p>

            <Flex expand column gap="xxs">
              <h4>
                What We Do
              </h4>
              <Grid :columns="isMobile ? 1 : 2" class="activities-grid" expand>
                <div class="activity-item">
                  <Icon name="ph:game-controller" :size="18" class="activity-icon" />
                  <span>Host dedicated game servers</span>
                </div>
                <div class="activity-item">
                  <Icon name="ph:code" :size="18" class="activity-icon" />
                  <span>Develop open-source projects</span>
                </div>
                <div class="activity-item">
                  <Icon name="ph:chat-circle" :size="18" class="activity-icon" />
                  <span>Provide community platforms</span>
                </div>
                <div class="activity-item">
                  <Icon name="ph:share-network" :size="18" class="activity-icon" />
                  <span>Share knowledge & resources</span>
                </div>
              </Grid>
            </Flex>
          </Flex>
        </Card>

        <!-- Community Links -->
        <Card class="community-info-card card-bg">
          <Flex column gap="m" expand>
            <Flex y-center gap="m">
              <div class="community-info-card__icon">
                <Icon name="ph:compass" size="2rem" />
              </div>
              <h3>
                Explore
              </h3>
            </Flex>

            <Flex column gap="s" expand>
              <NuxtLink
                v-for="link in communityLinks"
                :key="link.to"
                :to="link.to"
                :aria-label="link.ariaLabel"
                class="community-link"
              >
                <div class="community-link__content">
                  <div class="community-link__icon">
                    <Icon :name="link.icon" :size="20" />
                  </div>

                  <div class="community-link__text">
                    <strong class="community-link__title">
                      {{ link.title }}
                    </strong>
                    <p class="community-link__subtitle">
                      {{ link.subtitle }}
                    </p>
                  </div>
                  <div class="community-link__arrow">
                    <Icon name="ph:arrow-right" :size="18" />
                  </div>
                </div>
              </NuxtLink>
            </Flex>
          </Flex>
        </Card>
      </Grid>
    </section>

    <!-- Recent Projects -->
    <section v-if="recentProjects.length > 0" class="mt-xl">
      <Flex column gap="l">
        <Flex :y-end="!isMobile" :x-between="!isMobile" :column="isMobile" expand>
          <Flex gap="xxs" column>
            <h2 class="text-bold text-xxl">
              Featured Projects
            </h2>
            <p class="text-color-light">
              Discover what our community has been building
            </p>
          </Flex>
          <NuxtLink to="/community/projects" :class="isMobile ? 'w-100' : ''">
            <Button :expand="isMobile">
              <template #end>
                <Icon name="ph:arrow-right" />
              </template>
              View All Projects
            </Button>
          </NuxtLink>
        </Flex>

        <Grid :columns="3" gap="m" class="projects-grid" expand>
          <ProjectCard
            v-for="project in recentProjects"
            :key="project.id"
            :project="project"
            compact
          />
        </Grid>
      </Flex>
    </section>

    <!-- Monthly Funding Progress -->
    <section class="mt-xl">
      <FundingProgress />
    </section>

    <!-- Support Section with Community Supporters -->
    <section class="mt-l">
      <SupportCTA :supporter-ids="supporters" />
    </section>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/breakpoints.scss' as *;

.community-card {
  position: relative;
  overflow: hidden;

  &:before {
    content: '';
    display: block;
    width: 125%;
    height: 100%;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #a7fc2f;
    background: radial-gradient(
      circle,
      rgba(255, 255, 255, 0) 0%,
      rgba(255, 255, 255, 0) 25%,
      rgba(167, 252, 47, 0.025) 65%,
      rgba(167, 252, 47, 0.08) 100%
    );
  }
}

// Grid container for equal heights
.community-grid {
  align-items: stretch; // Ensure all grid items stretch to the same height

  @media screen and (max-width: $breakpoint-s) {
    grid-template-columns: 1fr !important;
  }
}

.community-info-card {
  height: 100%;

  p {
    color: var(--color-text-light);
    line-height: 1.6em;
    font-size: var(--font-size-m);
    margin-bottom: var(--space-s);
  }

  &__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--border-radius-m);
    background: linear-gradient(135deg, var(--color-bg-accent-lowered) 0%, var(--color-bg-accent-raised) 100%);

    .iconify {
      color: #fff;
    }
  }
}

.activities-grid {
  display: grid;
  gap: var(--space-s);
  margin-top: var(--space-s);

  .activity-item {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-s);
    border-radius: var(--border-radius-m);
    background: var(--color-bg-raised);
    border: 1px solid var(--color-border-weak);
    font-size: var(--font-size-xs);
    color: var(--color-text);
    transition: all 0.2s ease;

    .iconify {
      color: var(--color-accent);
    }
  }
}

.community-link {
  display: block;
  width: 100%;
  border-radius: var(--border-radius-m);
  border: 1px solid var(--color-border-weak);
  background-color: var(--color-bg-raised);

  &:hover {
    background: var(--color-button-gray-hover);

    .community-link__arrow {
      transform: translateX(4px);

      .iconify {
        color: var(--color-text-light);
      }
    }
  }

  &__content {
    display: flex;
    align-items: center;
    gap: var(--space-m);
    padding: var(--space-m);
    position: relative;
    z-index: 2;
  }

  &__text {
    flex: 1;

    .community-link__title {
      display: block;
      margin-bottom: var(--space-xs);
      font-size: var(--font-size-l);
      color: var(--color-text);
      font-weight: var(--font-weight-semibold);
      margin-bottom: 2px;
    }

    .community-link__subtitle {
      font-size: var(--font-size-s);
      color: var(--color-text-lighter);
      margin: 0 !important;
    }
  }

  &__arrow {
    transition: var(--transition);

    .iconify {
      color: var(--color-text-lighter);
    }
  }

  &__icon {
    display: flex;
    justify-content: center;
    width: 32px;
  }
}

// Section Icons
.section-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: var(--border-radius-l);
  flex-shrink: 0;

  &--members {
    background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-strong) 100%);
    color: white;
    box-shadow: 0 4px 15px -4px var(--color-accent-alpha);
  }
}

// Sign-in Prompt
.signin-prompt {
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
    border-radius: 50%;
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
  border-radius: 50%;
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
