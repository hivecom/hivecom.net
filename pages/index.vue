<script setup lang="ts">
import constants from '@/constants.json'
import { Button, Card, Divider, Dropdown, DropdownItem, Flex, Tooltip } from '@dolanske/vui'

import '@/assets/pages/landing.scss'

// For demonstration purposes only - replace with real data in production
const upcomingEvents = ref([
  { id: 1, title: 'Weekly Game Night', date: new Date(2025, 3, 10) },
  { id: 2, title: 'Tournament Finals', date: new Date(2025, 3, 17) },
  { id: 3, title: 'New Member Orientation', date: new Date(2025, 3, 25) },
])

const communityStats = ref({
  members: 400,
  gameservers: 20,
  age: 2025 - 2013,
  projects: 13,
})

// Convert platforms object to array for easier v-for iteration
const platforms = ref(Object.values(constants.PLATFORMS))

// Function to open URLs safely
function openUrl(url: string) {
  navigateTo(url, { external: true })
}
</script>

<template>
  <!-- Hero section -->
  <section class="section-hero">
    <h1 class="section-hero-title">
      Hivecom
    </h1>
    <p class="section-hero-tagline">
      A community of friends from all around the world. Creating a space for everyone and projects to thrive.
    </p>
    <div class="section-hero-actions">
      <Button variant="fill" color="primary">
        Join Community
      </Button>
      <Button variant="accent">
        Learn More
      </Button>
    </div>
  </section>

  <!-- Community Stats -->
  <section class="section-stats">
    <h2 class="heading">
      Community Overview
    </h2>
    <ClientOnly>
      <Divider />
    </ClientOnly>

    <div class="section-stats-grid">
      <div class="section-stats-card">
        <span class="section-stats-value">{{ communityStats.members }}+</span>
        <span class="section-stats-label">Community Members</span>
      </div>

      <div class="section-stats-card">
        <span class="section-stats-value">{{ communityStats.gameservers }}</span>
        <span class="section-stats-label">Gameservers</span>
      </div>

      <div class="section-stats-card">
        <span class="section-stats-value">{{ communityStats.age }} Years</span>
        <span class="section-stats-label">Founded in 2013</span>
      </div>

      <div class="section-stats-card">
        <span class="section-stats-value">{{ communityStats.projects }}</span>
        <span class="section-stats-label">Open Source Projects</span>
      </div>
    </div>
  </section>

  <!-- About section -->
  <section class="section-about">
    <h2 class="heading">
      About Us
    </h2>
    <ClientOnly>
      <Divider />
    </ClientOnly>

    <div class="section-about-content">
      <p>
        The community was originally created by the three server administrators: Catlinman, Jokler and Trif.
        All three started hosting a server back in 2013 on a local machine but the growing demand for a better connection
        and 24/7 uptime made them reconsider this small hosting plan. They later that year went over to actually acquiring
        a dedicated Teamspeak server from Fragnet but later on switched to what is now a server entirely run and managed by Hivecom itself.
      </p>
      <p>
        Hivecom wouldn't be anything without its members though. The server now has a total of about 400 registered members
        and is constantly growing. We're incredibly thankful for what we have now considering this all started with three
        friends getting together to chat and hang out.
      </p>
      <p>
        We are always happy to welcome anyone willing to join and hang out. We host some gaming servers as well as regular hangouts on teamspeak.
      </p>
    </div>
  </section>

  <!-- Join us section -->
  <section class="section-join">
    <!-- <Card> -->
    <h2 class="heading">
      Join us
    </h2>
    <ClientOnly>
      <Divider />
    </ClientOnly>
    <div class="section-join-container">
      <p class="section-join-text">
        We mainly talk on IRC and TeamSpeak. If discord is your thing, we have a bot connecting both services
        so you won't be excluded.
      </p>

      <div class="section-join-platforms">
        <Card v-for="platform in platforms" :key="platform.title">
          <div class="section-join-platforms-item">
            <div class="section-join-platforms-item-content">
              <Icon :name="platform.icon" class="platform-icon" />
              <h3 class="section-join-platforms-item-content-title">
                {{ platform.title }}
              </h3>
              <Tooltip v-if="platform.note !== ''" placement="top">
                <Icon name="ph:info" class="section-join-platforms-item-content-info" />
                <template #tooltip>
                  <p>{{ platform.note }}</p>
                </template>
              </Tooltip>
            </div>
            <!-- Single URL: Direct link button -->
            <a v-if="platform.urls.length === 1" :href="platform.urls[0].url" target="_blank" rel="noopener noreferrer">
              <Button>
                {{ platform.action }}
              </Button>
            </a>
            <!-- Multiple URLs: Dropdown menu -->
            <Dropdown
              v-else
              :items="platform.urls.map(url => ({
                label: url.title,
                click: () => openUrl(url.url),
              }))"
            >
              <template #trigger="{ toggle }">
                <Button @click="toggle">
                  <Flex row align-center gap="xs">
                    {{ platform.action }}
                    <Icon name="ph:caret-down" />
                  </Flex>
                </Button>
              </template>
              <DropdownItem v-for="url in platform.urls" :key="url.title">
                <a :href="url.url" target="_blank" rel="noopener noreferrer">
                  {{ url.title }}
                </a>
              </DropdownItem>
            </Dropdown>
          </div>
        </Card>
      </div>
    </div>
  </section>

  <!-- Upcoming Events -->
  <section class="section-events">
    <h2 class="heading">
      Upcoming Events
    </h2>
    <ClientOnly>
      <Divider />
    </ClientOnly>

    <div class="events-list">
      <Card v-for="event in upcomingEvents" :key="event.id">
        <h3 class="block mb-s">
          {{ event.title }}
        </h3>
        <div class="event-details">
          <ClientOnly>
            <template #fallback>
              <p>Date: {{ event.date.toDateString() }}</p>
            </template>
            <p>Date: {{ event.date.toLocaleDateString() }}</p>
          </ClientOnly>
        </div>
      </Card>
    </div>

    <div class="view-all">
      <Button @click="navigateTo('/events')">
        View All Events →
      </Button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.landing-page {
  padding-bottom: 3rem;
}

section {
  width: 100%;
  margin: 0 auto;
  padding: 0 1rem;
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

.section-hero {
  text-align: center;
  padding: 6.5rem 0;

  &-title {
    font-size: 4.8rem;
    font-weight: var(--font-weight-black);
    margin-bottom: 1rem;
  }

  &-tagline {
    font-size: 1.4rem;
    margin: 1rem 0 2rem;
    opacity: 0.8;
  }

  &-actions {
    display: flex;
    gap: 1rem;
    justify-content: center;
  }
}

.section-about {
  &-content {
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

.section-join {
  .section-join-text {
    text-align: center;
    margin-bottom: 2rem;
  }

  .section-join-container {
    margin: 2rem auto 0;
  }

  .section-join-platforms {
    display: grid;
    gap: var(--space-m);
    grid-template-columns: 2fr 2fr;

    @media screen and (max-width: 768px) {
      grid-template-columns: 1fr; /* Stack on smaller screens */
    }
  }

  .section-join-platforms-item {
    display: flex;
    justify-content: space-between;

    .section-join-platforms-item-content {
      display: flex;
      align-items: center;
      gap: var(--space-s);

      .section-join-platforms-item-content-title {
        font-size: 2rem;
      }

      .section-join-platforms-item-content-info.icon {
        font-size: 16px;
      }

      .section-join-platforms-item-content-dropdown {
        display: flex;
        align-items: center;
        gap: var(--space-xs);
        font-size: 1.2rem;
      }
    }

    .icon {
      font-size: 32px;
      border-radius: var(--border-radius-s);
    }
  }
}

// Center the list and make sure it is responsive
.section-events {
  .events-list {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem;
    margin-top: 2rem;
    justify-content: center; /* Added to center the list */

    .vui-card {
      width: 24%;
      flex: 0 1 auto;
    }
  }

  .event-details {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
}

.view-all {
  display: flex;
  justify-content: center;
  margin-top: 1.5rem;
  text-align: center;
}

.section-stats-grid {
  display: flex;
  justify-content: space-around;
  flex-wrap: wrap;
  margin-top: 2rem;
  gap: 2rem;
}

.section-stats-card {
  width: 156px;
  border-radius: var(--border-radius-m);
  text-align: center;
  padding: var(--space-m);

  .section-stats-value {
    display: block;
    font-size: 2.5rem;
    font-weight: bold;
    margin-bottom: var(--space-xs);
    color: var(--vui-color-primary);
  }

  .section-stats-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
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
</style>
