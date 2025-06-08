<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Button, Card, Divider, Dropdown, DropdownItem, Flex, Grid, Skeleton, Tooltip } from '@dolanske/vui'
import constants from '@/constants.json'
import EventCard from '~/components/Events/EventCard.vue'

// Fetch data from database
const supabase = useSupabaseClient()
const loading = ref(true)
const errorMessage = ref('')

// Real data from database
const events = ref<Tables<'events'>[]>([])
const communityStats = ref({
  members: 500,
  membersAccurate: false,
  gameservers: 0,
  age: new Date().getFullYear() - 2013,
  projects: 13, // This could be fetched from a projects table if you have one
})

// Convert platforms object to array for easier v-for iteration
const platforms = ref(Object.values(constants.PLATFORMS))

// Function to scroll to platforms section
function scrollToPlatforms() {
  if (process.client) {
    document.getElementById('platforms')?.scrollIntoView({ behavior: 'smooth' })
  }
}

// Fetch real data on component mount
onMounted(async () => {
  loading.value = true

  try {
    // Fetch all events and sort by status (ongoing first, then upcoming, then past)
    const { data: eventsData, error: eventsError } = await supabase
      .from('events')
      .select('*')
      .order('date', { ascending: true })

    if (eventsError)
      throw eventsError

    // Sort events by status: ongoing first, then upcoming, then past
    const sortedEvents = (eventsData || []).sort((a, b) => {
      const now = new Date()

      // Get status for event a
      const eventAStart = new Date(a.date)
      const eventAEnd = a.duration_minutes
        ? new Date(eventAStart.getTime() + a.duration_minutes * 60 * 1000)
        : eventAStart

      let statusA: 'ongoing' | 'upcoming' | 'past'
      if (now < eventAStart) {
        statusA = 'upcoming'
      }
      else if (now >= eventAStart && now <= eventAEnd) {
        statusA = 'ongoing'
      }
      else {
        statusA = 'past'
      }

      // Get status for event b
      const eventBStart = new Date(b.date)
      const eventBEnd = b.duration_minutes
        ? new Date(eventBStart.getTime() + b.duration_minutes * 60 * 1000)
        : eventBStart

      let statusB: 'ongoing' | 'upcoming' | 'past'
      if (now < eventBStart) {
        statusB = 'upcoming'
      }
      else if (now >= eventBStart && now <= eventBEnd) {
        statusB = 'ongoing'
      }
      else {
        statusB = 'past'
      }

      // Sort by status priority: ongoing (0), upcoming (1), past (2)
      const statusOrder = { ongoing: 0, upcoming: 1, past: 2 }
      const statusDiff = statusOrder[statusA] - statusOrder[statusB]

      if (statusDiff !== 0) {
        return statusDiff
      }

      // Within same status, sort by date
      if (statusA === 'past') {
        // For past events, show most recent first
        return new Date(b.date).getTime() - new Date(a.date).getTime()
      }
      else {
        // For ongoing and upcoming events, show earliest first
        return new Date(a.date).getTime() - new Date(b.date).getTime()
      }
    })

    events.value = sortedEvents.slice(0, 6) // Show up to 6 events

    // Fetch community member count
    const { count: membersCount, error: membersError } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })

    if (!membersError) {
      communityStats.value.members = membersCount || 500
      communityStats.value.membersAccurate = membersCount !== 0
    }

    // Fetch gameserver count
    const { count: gameserversCount, error: gameserversError } = await supabase
      .from('gameservers')
      .select('*', { count: 'exact', head: true })

    if (gameserversError)
      throw gameserversError
    communityStats.value.gameservers = gameserversCount || 0
  }
  catch (error: any) {
    console.error('Error fetching data:', error)
    errorMessage.value = error.message || 'Failed to fetch data'
  }
  finally {
    loading.value = false
  }
})
</script>

<template>
  <!-- Hero section -->
  <section class="hero-section">
    <div class="hero-section__globe-container">
      <NuxtImg src="landing/globe.svg" alt="Globe" class="hero-section__globe-image" />
    </div>
    <h1 class="hero-section__title">
      HIVECOM
    </h1>
    <p class="hero-section__tagline">
      A community of friends from all around the world. Creating a space to grow and projects to thrive.
    </p>
    <div class="hero-section__actions">
      <Button variant="fill" color="primary" @click="scrollToPlatforms">
        Join Community
      </Button>
      <Button variant="accent" @click="navigateTo('/community')">
        Learn More
      </Button>
    </div>

    <!-- Community Stats -->
    <div class="hero-section__stats">
      <ClientOnly>
        <Divider />
      </ClientOnly>

      <div class="hero-section__stats-grid">
        <div class="hero-section__stats-card">
          <Flex x-center class="hero-section__stats-value">
            <template v-if="loading">
              <Skeleton height="2.5rem" width="4rem" />
            </template>
            <template v-else>
              {{ communityStats.members }}{{ communityStats.membersAccurate ? '' : '+' }}
            </template>
          </Flex>
          <span class="hero-section__stats-label">Community Members</span>
        </div>

        <div class="hero-section__stats-card">
          <Flex x-center class="hero-section__stats-value">
            <template v-if="loading">
              <Skeleton height="2.5rem" width="2rem" />
            </template>
            <template v-else>
              {{ communityStats.gameservers }}
            </template>
          </Flex>
          <span class="hero-section__stats-label">Game Servers</span>
        </div>

        <div class="hero-section__stats-card">
          <span class="hero-section__stats-value">{{ communityStats.age }} Years</span>
          <span class="hero-section__stats-label">Founded in 2013</span>
        </div>

        <div class="hero-section__stats-card">
          <span class="hero-section__stats-value">{{ communityStats.projects }}</span>
          <span class="hero-section__stats-label">Open Source Projects</span>
        </div>
      </div>
    </div>
  </section>

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
        The community was originally created by the three server administrators: Catlinman (now zealsprince), Jokler and Trif.
        All three started hosting a server back in 2013 on a in-home Raspberry Pi but the growing demand for a better connection
        and 24/7 uptime made them reconsider this small hosting plan. They later that year went over to actually acquiring
        a dedicated TeamSpeak server from Fragnet but later on switched to what is now a server entirely run and managed by
        Hivecom itself.
      </p>
      <p>
        Hivecom has come a long way since then and wouldn't be anything without its members. We're incredibly thankful
        for what we have now considering this all started with three friends getting together to chat and hang out.
      </p>
      <p>
        We are always happy to welcome anyone willing to join us for this journey.
      </p>
    </div>
  </section>

  <!-- Join us section -->
  <section class="join-section">
    <!-- <Card> -->
    <h2 class="heading">
      Join us
    </h2>
    <ClientOnly>
      <Divider />
    </ClientOnly>
    <div class="join-section__container">
      <p class="join-section__text">
        We mainly talk on IRC and TeamSpeak. If Discord is your thing, we have a bot connecting both services so you won't be excluded.
      </p>

      <div id="platforms" class="join-section__platforms">
        <Card v-for="platform in platforms" :key="platform.title">
          <div class="join-section__platform-item">
            <div class="join-section__platform-content">
              <Icon :name="platform.icon" class="platform-icon" />
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
              v-if="platform.urls.length === 1" @click="navigateTo(platform.urls[0].url, { external: true,
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
    </div>
  </section>

  <!-- Events -->
  <section class="events-section">
    <h2 class="heading">
      Events
    </h2>
    <ClientOnly>
      <Divider />
    </ClientOnly>

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
      <EventCard
        v-for="event in events"
        :key="event.id"
        :event="event"
        compact
      />
    </Grid>

    <div class="events-section__view-all mb-m">
      <Button @click="navigateTo('/events')">
        View All Events
        <template #end>
          <Icon name="ph:arrow-right" />
        </template>
      </Button>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '@/assets/breakpoints.scss' as *;

:root.dark {
  .join-section__platform-item img {
    filter: invert(1);
  }

  .hero-section {
    &::before {
      opacity: 0.01;
    }

    &__globe-image {
      filter: invert(1) opacity(0.2);
    }
  }
}

.landing-page {
  padding-bottom: 3rem;
}

section {
  width: 100%;
  margin-bottom: 6rem;
}

.heading {
  text-align: center;
  font-size: 1.8rem;
  margin-bottom: 0.5rem;
}

h3 {
  font-size: 1.3rem;
}

h4 {
  font-size: 1.1rem;
  margin: 0;
}

.hero-section {
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100vh;
    opacity: 0.25;
    background-image: url(/landing/noise.gif);
    background-repeat: repeat;
    overflow: hidden;
    border-bottom: 1px solid var(--color-border-strong);
  }

  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: left;
  padding: 6.5rem 0;

  &__globe-container {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100vh;
    overflow: hidden;
  }

  &__globe-image {
    min-width: 1920px;
    width: 100%;
    height: 100vh;
    opacity: 0.02;
  }

  &__title {
    font-size: 12rem;
    font-stretch: ultra-condensed;
    font-weight: var(--font-weight-black);
    letter-spacing: -0.05em;
    transform: scaleY(0.8) translateX(-0.08em);
    line-height: 10rem;
    margin-bottom: 1rem;
    z-index: 1;

    @media screen and (max-width: $breakpoint-lg) {
      text-align: center;
      font-size: 8rem;
      line-height: 6rem;
    }
  }

  &__tagline {
    font-size: 1.4rem;
    margin: 1rem 0 2rem;
    opacity: 0.8;

    @media screen and (max-width: $breakpoint-lg) {
      text-align: center;
    }
  }

  &__actions {
    display: flex;
    gap: 1rem;
    justify-content: start;

    @media screen and (max-width: $breakpoint-lg) {
      justify-content: center;
    }
  }

  &__stats {
    margin-top: 4rem;
    z-index: 1;
  }

  &__stats-grid {
    display: flex;
    justify-content: space-around;
    flex-wrap: wrap;
    margin-top: 2rem;
    gap: 2rem;
  }

  &__stats-card {
    width: 156px;
    border-radius: var(--border-radius-m);
    text-align: center;
    padding: var(--space-m);
  }

  &__stats-value {
    display: block;
    font-size: 2.5rem;
    font-weight: bold;
    margin-bottom: var(--space-xs);
    color: var(--vui-color-primary);
  }

  &__stats-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
  }
}

.about-section {
  &__content {
    max-width: 900px;
    margin: 2rem auto 0;

    p {
      text-align: justify;
      margin-bottom: 1.5rem;
      line-height: 1.6;
    }

    .highlight-text {
      font-size: 1.2rem;
      font-weight: 500;
      padding: 1rem;
      border-left: 4px solid var(--vui-color-primary);
      background-color: rgba(var(--vui-color-primary-rgb), 0.05);
    }
  }
}

.join-section {
  &__text {
    text-align: center;
    margin-bottom: 2rem;
  }

  &__container {
    max-width: 900px;
    margin: 2rem auto 0;
  }

  &__platforms {
    display: grid;
    gap: var(--space-m);
    grid-template-columns: 2fr 2fr;

    @media screen and (max-width: $breakpoint-sm) {
      grid-template-columns: 1fr; /* Stack on smaller screens */
    }
  }

  &__platform-item {
    display: flex;
    justify-content: space-between;
  }

  &__platform-content {
    display: flex;
    align-items: center;
    gap: var(--space-s);
  }

  &__platform-title {
    font-size: 2rem;
  }

  &__platform-info.icon {
    font-size: 16px !important;
  }

  &__platform-dropdown {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: 1.2rem;
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
    max-width: 900px;
    text-align: left;

    @media screen and (max-width: $breakpoint-sm) {
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
    font-weight: 500;
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
