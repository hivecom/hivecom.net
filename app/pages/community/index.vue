<script setup lang="ts">
import type { Database } from '@/types/database.types'
import { Button, Card, Flex, Grid } from '@dolanske/vui'
import FundingProgress from '@/components/Community/FundingProgress.vue'
import ProjectCard from '@/components/Community/ProjectCard.vue'
import SupportCTA from '@/components/Community/SupportCTA.vue'
import BulkAvatarDisplay from '@/components/Shared/BulkAvatarDisplay.vue'

// Get current user for authentication checks
const user = useSupabaseUser()
const supabase = useSupabaseClient()

// State for community members
const randomUsers = ref<string[]>([])
const supporters = ref<string[]>([])
const loading = ref(true)
const error = ref('')

// State for recent projects
const recentProjects = ref<Database['public']['Tables']['projects']['Row'][]>([])

// Fetch community data
async function fetchCommunityData() {
  try {
    loading.value = true
    error.value = ''

    if (user.value) {
      // Fetch supporters, random users, and recent projects in parallel for authenticated users
      const [supportersResult, randomUsersResult, projectsResult] = await Promise.all([
        // Fetch supporters (lifetime and patreon)
        supabase
          .from('profiles')
          .select('id, supporter_lifetime, supporter_patreon')
          .eq('banned', false)
          .or('supporter_lifetime.eq.true,supporter_patreon.eq.true')
          .order('created_at', { ascending: true }), // Show earliest supporters first

        // Fetch random selection of users
        supabase
          .from('profiles')
          .select('id')
          .eq('banned', false)
          .limit(200), // Get more to randomize from

        // Fetch random projects
        supabase
          .from('projects')
          .select('*')
          .limit(50), // Get more projects to randomize from
      ])

      if (supportersResult.error) {
        console.warn('Error fetching supporters:', supportersResult.error)
      }
      else if (supportersResult.data) {
        supporters.value = supportersResult.data.map(u => u.id)
      }

      if (randomUsersResult.error) {
        console.warn('Error fetching random users:', randomUsersResult.error)
      }
      else if (randomUsersResult.data) {
        // Shuffle and take max 50 users
        const shuffled = (randomUsersResult.data as Array<{ id: string }>)
          .map(user => ({ user, sort: Math.random() }))
          .sort((a, b) => a.sort - b.sort)
          .map(({ user }) => user)
          .slice(0, 50)

        randomUsers.value = shuffled.map(u => u.id)
      }

      if (projectsResult.error) {
        console.warn('Error fetching random projects:', projectsResult.error)
      }
      else if (projectsResult.data) {
        // Shuffle projects and take 3 random ones
        const shuffledProjects = projectsResult.data
          .map(project => ({ project, sort: Math.random() }))
          .sort((a, b) => a.sort - b.sort)
          .map(({ project }) => project)
          .slice(0, 3)

        recentProjects.value = shuffledProjects
      }
    }
    else {
      // For non-authenticated users, just fetch random projects
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select('*')
        .limit(50) // Get more projects to randomize from

      if (projectsError) {
        console.warn('Error fetching random projects:', projectsError)
      }
      else if (projectsData) {
        // Shuffle projects and take 3 random ones
        const shuffledProjects = projectsData
          .map(project => ({ project, sort: Math.random() }))
          .sort((a, b) => a.sort - b.sort)
          .map(({ project }) => project)
          .slice(0, 3)

        recentProjects.value = shuffledProjects
      }
    }
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

    <!-- Community Members -->
    <Card v-if="user && randomUsers.length > 0" class="pb-l">
      <Flex column gap="m" x-center y-center>
        <Flex y-center gap="m" x-center expand>
          <Flex column :gap="0" x-center class="text-center" y-center>
            <h2 class="text-bold text-xxl">
              Community Members
            </h2>
            <p class="text-color-light">
              Meet some of our amazing community members from around the world
            </p>
          </Flex>
        </Flex>
        <BulkAvatarDisplay
          :user-ids="randomUsers"
          :max-users="32"
          :avatar-size="64"
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
        <Card class="about-card">
          <div class="about-card__content">
            <Flex column gap="m" expand>
              <Flex y-center gap="m" class="about-header">
                <div class="about-icon">
                  <Icon name="ph:users-three" size="2rem" />
                </div>
                <h3 class="text-bold text-xl">
                  About Our Community
                </h3>
              </Flex>

              <p class="about-description">
                Hivecom is a passionate community of developers, gamers, and friends who love building and sharing projects together. We host game servers, develop open-source tools, and create a welcoming space for collaboration.
              </p>

              <Flex expand column gap="xxs">
                <Flex y-center gap="s" class="mb-s">
                  <Icon name="ph:rocket-launch" size="1.2rem" class="color-accent" />
                  <h4 class="text-bold">
                    What We Do
                  </h4>
                </Flex>
                <Grid columns="2" class="activities-grid" expand>
                  <div class="activity-item">
                    <Icon name="ph:game-controller" size="1rem" class="activity-icon" />
                    <span>Host dedicated game servers</span>
                  </div>
                  <div class="activity-item">
                    <Icon name="ph:code" size="1rem" class="activity-icon" />
                    <span>Develop open-source projects</span>
                  </div>
                  <div class="activity-item">
                    <Icon name="ph:chat-circle" size="1rem" class="activity-icon" />
                    <span>Provide community platforms</span>
                  </div>
                  <div class="activity-item">
                    <Icon name="ph:share-network" size="1rem" class="activity-icon" />
                    <span>Share knowledge & resources</span>
                  </div>
                </Grid>
              </Flex>
            </Flex>
          </div>
          <div class="about-card__decoration" />
        </Card>

        <!-- Community Links -->
        <Card class="links-card">
          <div class="links-card__content">
            <Flex column gap="m" expand>
              <Flex y-center gap="m" class="links-header">
                <div class="links-icon">
                  <Icon name="ph:compass" size="2rem" />
                </div>
                <h3 class="text-bold text-xl">
                  Explore More
                </h3>
              </Flex>

              <Flex column gap="s" expand>
                <NuxtLink
                  to="/events"
                  class="community-link community-link--events"
                  aria-label="View upcoming community events and activities"
                >
                  <div class="community-link__content">
                    <div class="community-link__icon">
                      <Icon name="ph:calendar" size="1.4rem" />
                    </div>
                    <div class="community-link__text">
                      <div class="community-link__title">
                        Community Events
                      </div>
                      <div class="community-link__subtitle">
                        Join our community events and online gatherings
                      </div>
                    </div>
                    <div class="community-link__arrow">
                      <Icon name="ph:arrow-right" size="1.2rem" />
                    </div>
                  </div>
                </NuxtLink>

                <NuxtLink
                  to="/community/projects"
                  class="community-link community-link--projects"
                  aria-label="Explore community projects and initiatives"
                >
                  <div class="community-link__content">
                    <div class="community-link__icon">
                      <Icon name="ph:folder" size="1.4rem" />
                    </div>
                    <div class="community-link__text">
                      <div class="community-link__title">
                        Community Projects
                      </div>
                      <div class="community-link__subtitle">
                        Explore projects and initiatives from our community
                      </div>
                    </div>
                    <div class="community-link__arrow">
                      <Icon name="ph:arrow-right" size="1.2rem" />
                    </div>
                  </div>
                </NuxtLink>

                <NuxtLink
                  to="/community/funding"
                  class="community-link community-link--funding"
                  aria-label="View our funding transparency and financial information"
                >
                  <div class="community-link__content">
                    <div class="community-link__icon">
                      <Icon name="ph:chart-bar" size="1.4rem" />
                    </div>
                    <div class="community-link__text">
                      <div class="community-link__title">
                        Funding & Transparency
                      </div>
                      <div class="community-link__subtitle">
                        See how we're funded and where contributions go
                      </div>
                    </div>
                    <div class="community-link__arrow">
                      <Icon name="ph:arrow-right" size="1.2rem" />
                    </div>
                  </div>
                </NuxtLink>

                <NuxtLink
                  to="/gameservers"
                  class="community-link community-link--gameservers"
                  aria-label="Explore our game servers and gaming community"
                >
                  <div class="community-link__content">
                    <div class="community-link__icon">
                      <Icon name="ph:game-controller" size="1.4rem" />
                    </div>
                    <div class="community-link__text">
                      <div class="community-link__title">
                        Game Servers
                      </div>
                      <div class="community-link__subtitle">
                        Connect to our hosted game servers
                      </div>
                    </div>
                    <div class="community-link__arrow">
                      <Icon name="ph:arrow-right" size="1.2rem" />
                    </div>
                  </div>
                </NuxtLink>
              </Flex>
            </Flex>
          </div>
          <div class="links-card__decoration" />
        </Card>
      </Grid>
    </section>

    <!-- Recent Projects -->
    <section v-if="recentProjects.length > 0" class="mt-xl">
      <Flex column gap="l">
        <Flex y-center x-between expand>
          <div>
            <h2 class="text-bold text-xxl">
              Featured Projects
            </h2>
            <p class="text-color-light">
              Discover what our community has been building
            </p>
          </div>
          <NuxtLink to="/community/projects">
            <Button>
              <template #end>
                <Icon name="ph:arrow-right" />
              </template>
              View All Projects
            </Button>
          </NuxtLink>
        </Flex>

        <Grid :columns="3" gap="l" class="projects-grid" expand>
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

// Grid container for equal heights
.community-grid {
  align-items: stretch; // Ensure all grid items stretch to the same height

  @media screen and (max-width: $breakpoint-sm) {
    grid-template-columns: 1fr !important;
  }
}

// About Card Styling
.about-card {
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, var(--color-bg-raised) 0%, var(--color-bg-medium) 100%);
  border: 1px solid var(--color-border);
  transition: all 0.3s ease;
  height: 100%; // Fill the grid item height
  display: flex;
  flex-direction: column;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px -8px var(--color-shadow);
    border-color: var(--color-border-strong);
  }

  &__content {
    position: relative;
    z-index: 2;
    flex: 1; // Fill remaining space
    display: flex;
    flex-direction: column;
  }

  &__decoration {
    position: absolute;
    top: -50%;
    right: -20%;
    width: 200px;
    height: 200px;
    background: radial-gradient(circle, var(--color-accent-alpha) 0%, transparent 70%);
    border-radius: 50%;
    opacity: 0.1;
    pointer-events: none;
  }
}

.about-header {
  margin-bottom: var(--space-xs);
}

.about-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: var(--border-radius-m);
  background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-bg-accent-raised) 100%);
  color: white;
  flex-shrink: 0;
}

.about-description {
  color: var(--color-text-light);
  line-height: 1.6;
  font-size: var(--font-size-s);
}

.activities-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-s);
  margin-top: var(--space-s);
}

.activity-item {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs);
  border-radius: var(--border-radius-s);
  background: var(--color-bg-raised);
  border: 1px solid var(--color-border-weak);
  font-size: var(--font-size-xs);
  color: var(--color-text-light);
  transition: all 0.2s ease;

  &:hover {
    background: var(--color-bg-medium);
    border-color: var(--color-border);
  }
}

.activity-icon {
  color: var(--color-accent);
  flex-shrink: 0;
}

// Links Card Styling
.links-card {
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, var(--color-bg-raised) 0%, var(--color-bg-medium) 100%);
  border: 1px solid var(--color-border);
  transition: all 0.3s ease;
  height: 100%; // Fill the grid item height
  display: flex;
  flex-direction: column;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px -8px var(--color-shadow);
    border-color: var(--color-border-strong);
  }

  &__content {
    position: relative;
    z-index: 2;
    flex: 1; // Fill remaining space
    display: flex;
    flex-direction: column;
  }

  &__decoration {
    position: absolute;
    bottom: -50%;
    left: -20%;
    width: 200px;
    height: 200px;
    background: radial-gradient(circle, var(--color-accent-alpha) 0%, transparent 70%);
    border-radius: 50%;
    opacity: 0.1;
    pointer-events: none;
  }
}

.links-header {
  margin-bottom: var(--space-xs);
}

.links-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: var(--border-radius-m);
  background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-bg-accent-raised) 100%);
  color: white;
  flex-shrink: 0;
}

// Community Links Styling
.community-link {
  display: block;
  width: 100%;
  text-decoration: none;
  border-radius: var(--border-radius-m);
  border: 1px solid var(--color-border-weak);
  background: var(--color-bg-raised);
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;

  &:hover {
    border-color: var(--color-border);
    background: var(--color-bg-medium);
    transform: translateY(-1px);
    box-shadow: 0 4px 15px -4px var(--color-shadow);

    .community-link__icon {
      transform: scale(1.1);
    }

    .community-link__arrow {
      transform: translateX(4px);
      opacity: 1;
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

  &__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--border-radius-s);
    color: var(--color-accent);
    background: var(--color-bg-accent-weak);
    flex-shrink: 0;
    transition: all 0.3s ease;
  }

  &__text {
    flex: 1;
  }

  &__title {
    font-weight: var(--font-weight-bold);
    color: var(--color-text);
    margin-bottom: 2px;
  }

  &__subtitle {
    font-size: var(--font-size-xs);
    color: var(--color-text-light);
    line-height: 1.4;
  }

  &__arrow {
    color: var(--color-text-light);
    opacity: 0.6;
    transition: all 0.3s ease;
    flex-shrink: 0;
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
  @media screen and (max-width: $breakpoint-md) {
    grid-template-columns: 1fr 1fr !important;
  }

  @media screen and (max-width: $breakpoint-sm) {
    grid-template-columns: 1fr !important;
  }
}

.project-card {
  position: relative;
  overflow: hidden;
  background: var(--color-bg-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px -8px var(--color-shadow);
    border-color: var(--color-border-strong);
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
