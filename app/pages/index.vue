<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Alert, Button, Card, Divider, Dropdown, DropdownItem, Flex, Grid, Skeleton, Tooltip } from '@dolanske/vui'
import constants from '~~/constants.json'
import EventCardLanding from '@/components/Events/EventCardLanding.vue'
import LandingHero from '@/components/Landing/LandingHero.vue'
import { useDataEvents } from '@/composables/useDataEvents'

definePageMeta({
  layout: 'landing',
})

// Fetch data from database
const user = useSupabaseUser()
const { fetchMetrics } = useDataMetrics()
const loading = ref(true)
const errorMessage = ref('')

// Events via shared cache - no dedicated fetch needed here
const { events: allEvents } = useDataEvents()

// Sorted/sliced events for the landing page cards
const events = computed<Tables<'events'>[]>(() => {
  const now = new Date()

  function getStatus(event: Tables<'events'>): 'ongoing' | 'upcoming' | 'past' {
    const start = new Date(event.date)
    const end = event.duration_minutes
      ? new Date(start.getTime() + event.duration_minutes * 60 * 1000)
      : start

    if (now < start)
      return 'upcoming'
    if (now >= start && now <= end)
      return 'ongoing'
    return 'past'
  }

  const statusOrder = { ongoing: 0, upcoming: 1, past: 2 }

  return allEvents.value.toSorted((a, b) => {
    const statusDiff = statusOrder[getStatus(a)] - statusOrder[getStatus(b)]
    if (statusDiff !== 0)
      return statusDiff
    // Past: most recent first; ongoing/upcoming: earliest first
    return getStatus(a) === 'past'
      ? new Date(b.date).getTime() - new Date(a.date).getTime()
      : new Date(a.date).getTime() - new Date(b.date).getTime()
  }).slice(0, 3)
})

const communityStats = ref({
  members: 100,
  membersAccurate: false,
  gameservers: 5,
  age: new Date().getFullYear() - 2013,
  projects: 10, // Will be fetched from the projects table
  forumPosts: 1000,
})

// Convert platforms object to array for easier v-for iteration
const platforms = ref(Object.values(constants.PLATFORMS))

// Fetch real data on component mount
onMounted(async () => {
  loading.value = true

  try {
    const metricsSnapshot = await fetchMetrics()
    if (metricsSnapshot != null) {
      const users = metricsSnapshot.totals.users
      communityStats.value.membersAccurate = users > 0
      communityStats.value.members = users > 0 ? users : 100
      communityStats.value.gameservers = metricsSnapshot.totals.gameservers
      communityStats.value.projects = metricsSnapshot.totals.projects
      communityStats.value.forumPosts = metricsSnapshot.totals.forumPosts
    }
  }
  catch (error: unknown) {
    console.error('Error fetching data:', error)
    errorMessage.value = (error as Error).message || 'Failed to fetch data'
  }
  finally {
    loading.value = false
  }
})
</script>

<template>
  <div style="display:contents;">
    <LandingHero :community-stats="communityStats" :loading="loading" />

    <div class="container-l">
      <div class="page-landing container-m">
        <!-- About section -->
        <section class="about-section">
          <h2 class="heading">
            About Us
          </h2>
          <ClientOnly>
            <Divider />
          </ClientOnly>

          <div class="about-section__content">
            <p>
              The community was originally created by <b>Catlinman (now zealsprince), Jokler and Trif.</b>
            </p>
            <p>
              We started hosting a server back in 2013 on an in-home Raspberry Pi but the growing demand for a better connection
              and 24/7 uptime made us reconsider this small hosting plan. We later that year went over to actually acquiring
              a dedicated TeamSpeak server from Fragnet but later on switched to what is now a server entirely run and managed by
              Hivecom itself.
            </p>
            <p>
              Hivecom has come a long way since then and wouldn't be anything without those that make up its community. We're incredibly thankful
              for what we have now considering this all started with three friends getting together to chat and hang out.
            </p>
            <p>
              <b>We are always happy to welcome anyone willing to join us for this journey.</b>
            </p>
          </div>
        </section>

        <!-- Join us section -->
        <section class="join-section">
          <div class="join-section__container">
            <div class="join-section__copy">
              <h2 class="heading">
                Join us
              </h2>
              <p class="join-section__text">
                We mainly talk on IRC and TeamSpeak. If Discord is your thing, we have a bot connecting both services so you won't be excluded.
              </p>

              <p class="join-section__text">
                If you're interested in the latest news, want to support the community, create your own events or RSVP to the latest ones, feel free to sign up.
              </p>

              <Alert v-if="user" variant="success" filled>
                <template #icon>
                  <Icon name="ph:users-three" />
                </template>
                Thanks for being a part of the community!
              </Alert>

              <NuxtLink v-else to="/auth/sign-up">
                <Button variant="accent">
                  <template #start>
                    <Icon name="ph:user-plus" />
                  </template>
                  Sign up
                </Button>
              </NuxtLink>
            </div>

            <Card class="join-section__platforms">
              <div v-for="platform in platforms" :key="platform.title" class="join-section__platform-item">
                <div class="join-section__platform-content">
                  <Icon :name="platform.icon" size="32" class="platform-icon" />
                  <h3 class="join-section__platform-title">
                    {{ platform.title }}
                  </h3>
                  <Tooltip v-if="platform.note !== ''" placement="top">
                    <Icon name="ph:info" class="join-section__platform-info" />
                    <template #tooltip>
                      <p>{{ platform.note }}</p>
                    </template>
                  </Tooltip>
                </div>
                <!-- Single URL: Direct link button -->
                <Button
                  v-if="platform.urls.length === 1 && platform.urls[0]"
                  @click="navigateTo(platform.urls[0].url, { external: true,
                                                             open: { target: '_blank' } })"
                >
                  {{ platform.action }}
                </Button>
                <!-- Multiple URLs: Dropdown menu -->
                <Dropdown v-else>
                  <template #trigger="{ toggle }">
                    <Button @click="toggle">
                      <Flex row y-center gap="xs">
                        {{ platform.action }}
                        <Icon name="ph:caret-down" />
                      </Flex>
                    </Button>
                  </template>
                  <DropdownItem v-for="url in platform.urls" :key="url.title">
                    <NuxtLink
                      external
                      no-prefetch
                      :href="url.url"
                      target="_blank"
                      rel="noopener noreferrer"
                      :aria-label="`Connect to ${platform.title} on ${url.title}`"
                    >
                      {{ url.title }}
                    </NuxtLink>
                  </DropdownItem>
                </Dropdown>
              </div>
            </Card>
          </div>
        </section>

        <!-- Events -->
        <section class="events-section">
          <h2 class="heading">
            Events
          </h2>

          <Grid v-if="loading" class="events-section__list" :columns="3" gap="m">
            <!-- Loading state -->
            <Card v-for="i in 3" :key="i">
              <Skeleton height="1.5rem" width="80%" class="mb-s" />
              <Skeleton height="1rem" width="60%" />
            </Card>
          </Grid>

          <div v-else-if="errorMessage" class="events-section__error">
            <Card>
              <p class="events-section__error-text">
                Failed to load events: {{ errorMessage }}
              </p>
            </Card>
          </div>

          <div v-else-if="events.length === 0" class="events-section__empty">
            <Card>
              <p>No events scheduled.</p>
            </Card>
          </div>

          <Grid v-else class="events-section__list" :columns="3" gap="m" expand>
            <EventCardLanding
              v-for="event in events"
              :key="event.id"
              :event="event"
              compact
            />
          </Grid>

          <div class="events-section__view-all mb-m">
            <NuxtLink to="/events">
              <Button>
                View All Events
                <template #end>
                  <Icon name="ph:arrow-right" />
                </template>
              </Button>
            </NuxtLink>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.join-section__platform-info.icon {
  font-size: 16px !important;
}
</style>

<style scoped lang="scss">
@use '@/assets/breakpoints.scss' as *;

:root.dark {
  .join-section__platform-item img {
    filter: invert(1);
  }
}

.page-landing {
  padding-bottom: 3rem;
}

section {
  width: 100%;
  margin-bottom: 6rem;
}

.heading {
  text-align: center;
  font-size: var(--font-size-xxxl);
  margin-bottom: 0.5rem;
}

h3 {
  font-size: var(--font-size-l);
}

h4 {
  font-size: var(--font-size-m);
  margin: 0;
}

.about-section {
  padding-top: 4rem;

  &__content {
    margin: 2rem auto 0;

    p {
      text-align: center;
      margin-bottom: 4rem;
      line-height: 1.6;
    }

    .highlight-text {
      font-size: var(--font-size-m);
      font-weight: var(--font-weight-medium);
      padding: 1rem;
    }
  }
}

.join-section {
  display: block;
  margin-block: 96px;

  .heading {
    display: block;
    text-align: left;
    margin-bottom: var(--space-xl);
  }

  &__text {
    text-align: left;
    margin-bottom: var(--space-l);
  }

  &__container {
    display: grid;
    grid-template-columns: 1.5fr 1fr;
    align-items: center;
    gap: 64px;
    margin: 2rem auto 0;

    @media screen and (max-width: $breakpoint-m) {
      grid-template-columns: 1fr 1fr;
    }

    @media screen and (max-width: $breakpoint-s) {
      display: flex;
      gap: var(--space-xl);
      flex-direction: column;

      .join-section__text,
      .heading {
        text-align: center;
      }

      .join-section__copy {
        .vui-button {
          margin: auto;
        }
      }
    }
  }

  &__platform-item {
    display: flex;
    justify-content: space-between;
    padding-bottom: var(--space-m);
    margin-bottom: var(--space-m);
    border-bottom: 1px solid var(--color-border);

    &:last-of-type {
      padding-bottom: 0;
      margin-bottom: 0;
      border-bottom: none;
    }
  }

  &__platform-content {
    display: flex;
    align-items: center;
    gap: var(--space-s);
  }

  &__platform-title {
    font-size: var(--font-size-l);
    text-align: left;
    font-weight: var(--font-weight-medium);
  }

  &__platform-dropdown {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: var(--font-size-m);
  }

  .icon {
    font-size: 32px;
    border-radius: var(--border-radius-s);
  }
}

// Center the list and make sure it is responsive
.events-section {
  &__list {
    margin: 2rem auto 0;
    text-align: left;
    align-items: stretch !important;

    @media screen and (max-width: $breakpoint-s) {
      grid-template-columns: 1fr !important;
    }
  }

  &__error,
  &__empty {
    .vui-card {
      text-align: center;
      padding: var(--space-l);
      background: var(--color-bg-subtle);
      border: 2px dashed var(--color-border-subtle);

      &:hover {
        transform: none;
        box-shadow: none;
      }
    }
  }

  &__error-text {
    color: var(--color-text-red);
    font-weight: var(--font-weight-medium);
  }

  &__view-all {
    display: flex;
    justify-content: center;
    margin-top: 1.5rem;
    text-align: center;
  }
}

.newsletter {
  &-toggle {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-top: 1rem;
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}
</style>
